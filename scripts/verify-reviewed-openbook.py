#!/usr/bin/env python3
"""Recompile journaled OpenBook heads without modifying repository exports.

Requires Python >=3.11 and LilyPond 2.26.0; no pip dependencies.
Example:
  python3 scripts/verify-reviewed-openbook.py --source-dir /path/to/book-openbook \
    --lilypond /path/to/lilypond --work-dir /tmp/reviewed-openbook-audit

The intake journal selects the arrangements. Permanent references authorize
every primary-voice selection, harmonic reference and textual navigation route.
Compiler files, fresh GM65 MIDI and audit.json are written only to --work-dir.
"""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys


sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(path.read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def inside(path, parent):
    return path == parent or parent in path.parents


def source_identity(review, provenance):
    return all(review.get(key) == provenance.get(field) for key, field in (
        ('sourcePath', 'path'), ('sourceSha256', 'sha256'),
        ('sourceVersion', 'sourceVersion')))


def verify_one(stored, review, context):
    ob, nav, ties = context['modules']
    provenance = stored['provenance']
    identifier = stored['id']
    require(source_identity(review, provenance), 'Journal source identity differs')
    require(review['noteCount'] == len(stored['notes']) and
            review['totalBeats'] == stored['totalBeats'], 'Journal timing differs')
    require(provenance.get('sourceTimelineExact') is True,
            'Source timeline lacks reviewed admission')
    require(provenance.get('repositoryCommit') == ob.COMMIT, 'Source commit differs')

    source = (context['source'] / provenance['path']).resolve()
    require(inside(source, context['source']), 'Source path escapes --source-dir')
    require(digest(source) == provenance['sha256'], 'Original source bytes differ')
    proof_path = (ROOT / review['proof']).resolve()
    require(inside(proof_path, ROOT / 'evidence/reviewed-melody-proofs'),
            'Journal proof path escapes the evidence directory')
    require(digest(proof_path) == review['proofSha256'], 'Admitted proof bytes differ')
    proof = read(proof_path)
    require(proof.get('status') == 'PASS' and proof.get('melodyId') == identifier and
            proof.get('sourceSha256') == provenance['sha256'] and
            proof.get('notesSha256') == review['notesSha256'] and
            proof.get('noteCount') == len(stored['notes']) and
            proof.get('totalBeats') == stored['totalBeats'],
            'Admitted proof identity differs')

    primary = context['primary'].get(identifier)
    selection = provenance.get('curatedPrimaryVoice')
    require(bool(primary) == bool(selection), 'Primary-voice reference is missing')
    if primary:
        require(source_identity(primary, provenance) and all(
            primary[key] == selection[key] for key in ('events', 'evidence')),
            'Stored primary-voice evidence differs from its permanent reference')

    navigation = provenance.get('reviewedNavigation')
    plan = context['navigation'].get((provenance['path'], provenance['sourceVersion']))
    tie_plan = ties.reviewed_tie_plan(identifier) if identifier in ties.REVIEWS else None
    require(bool(navigation) == bool(plan or tie_plan), 'Navigation reference is missing')
    if navigation:
        require(navigation['plan'] == (tie_plan or plan),
                'Stored navigation differs from the permanent route')

    repeated = provenance.get('repeatedPartialReview')
    if repeated:
        require(source_identity(repeated, provenance), 'Repeated-pickup source differs')
    grace = provenance.get('engravingGraceTraversal')
    if grace:
        require(identifier == 'openbook-whisper-not-laurent' and
                provenance['sha256'] ==
                '020a67b42be1bd23fe501fd5a02662853f5feac7f4d02ec319718d4904cf939b',
                'Unreviewed engraving-grace diagnostic opt-in')

    work = (context['work'] / identifier).resolve()
    require(inside(work, context['work']) and not inside(work, ROOT),
            'Compiler output path escapes scratch directory')
    work.mkdir(parents=True, exist_ok=True)
    require(not any(child.is_symlink() for child in work.iterdir()),
            'Compiler scratch contains a symlink output')
    entry = ob.decode(
        source, provenance['sourceVersion'], context['lilypond'], context['qualities'],
        context['source'], work, allow_source_intervals=True, allow_pickups=True,
        allow_meter_changes=True,
        allow_notated_alternatives=bool(provenance.get('notatedAlternatives')),
        reviewed_navigation=bool(navigation), ignore_engraving_grace=bool(grace),
        reviewed_repeated_partials=bool(repeated), reviewed_primary=primary)
    require(entry['id'] == identifier, 'Compiler source ID differs')

    stem = ob.slug(source.stem) + '-' + ob.slug(provenance['sourceVersion'])
    compiler_midi = work / (stem + '.midi')
    raw_notes, source_ppq, _ = ob.decode_midi(compiler_midi, True)
    selected = list(raw_notes)
    omissions = []
    alternatives = entry['provenance'].get('notatedAlternatives')
    require(alternatives == provenance.get('notatedAlternatives'),
            'Notated-alternative evidence differs')
    choices = [
        (event, event['omittedParenthesizedPitches'])
        for event in (alternatives or {}).get('events', [])]
    if primary:
        choices += [(event, event['omittedPitches']) for event in primary['events']]
    for event, pitches in choices:
        for pitch in pitches:
            matches = [note for note in selected if note['pitch'] == pitch and
                       abs(note['start'] - event['start']) < 1e-7 and
                       abs(note['duration'] - event['duration']) < 1e-7]
            require(len(matches) == 1, 'Pinned omitted compiler note differs')
            selected.remove(matches[0])
            omissions.append(matches[0])
    require(selected == entry['notes'], 'Compiler MIDI differs beyond pinned omissions')
    require(source_ppq == provenance['sourcePPQ'], 'Compiler MIDI PPQ differs')
    if repeated:
        require(entry['provenance']['repeatedPartialReview'] == repeated,
                'Compiled repeated-pickup map differs')
    if tie_plan:
        entry = ties.apply_tie_navigation_plan(entry, tie_plan, context['source'])
    elif plan:
        entry = nav.apply_navigation_plan(entry, plan)
    if navigation:
        require(entry['provenance']['reviewedNavigation'] == navigation,
                'Compiled navigation trace differs')

    harmonic = context['harmonic'].get(identifier)
    require(bool(harmonic) == bool(provenance.get('harmonicTonicReference')),
            'Harmonic-tonic reference is missing')
    if harmonic:
        require(harmonic == provenance['harmonicTonicReference'],
                'Stored harmonic-tonic reference differs')
        entry = ob.apply_harmonic_reference(
            entry, harmonic, context['canonical'][review['canonicalSong']])
    arrangement = context['arrangements'].get(identifier)
    require(bool(arrangement) == bool(provenance.get('sourceArrangementReference')),
            'Separate-arrangement reference is missing')
    if arrangement:
        require(arrangement == provenance['sourceArrangementReference'] and
                source_identity(arrangement, provenance) and
                arrangement['sourceDeclaredKey'] == entry['provenance']['sourceKeySignature'] and
                arrangement['normalizationTonic'] ==
                dict(root=entry['tonic'][0], mode=entry['tonic'][1]),
                'Literal source arrangement/key reference differs')

    for field in ('notes', 'chords', 'measures', 'tonic', 'totalBeats', 'pickupBeats'):
        require(entry[field] == stored[field], 'Recompiled ' + field + ' differ')
    require(entry['provenance'].get('midiMeterEvents') == provenance.get('midiMeterEvents'),
            'Recompiled MIDI meter events differ')
    if 'sourceFullMeasureCount' in stored:
        count = sum(abs(m['duration'] - entry['barBeats']) < 1e-8
                    for m in entry['measures'])
        require(count == stored['sourceFullMeasureCount'], 'Full-measure count differs')

    ppq = stored.get('melodyPPQ', 10080)
    fresh_midi = work / (identifier + '.mid')
    fresh_midi.write_bytes(ob.midi_bytes(
        entry['notes'], entry['title'], entry['totalBeats'],
        entry['provenance'].get('midiMeterEvents'), ppq=ppq))
    require(ob.decode_midi(fresh_midi)[0] == stored['notes'],
            'Fresh GM65 MIDI pitch/onset/duration/velocity differs')
    exported_midi = (ROOT / 'dist' / stored['midi']).resolve()
    require(inside(exported_midi, ROOT / 'dist/melodies'), 'Exported MIDI path escapes dist')
    require(digest(fresh_midi) == digest(exported_midi) == review['midiSha256'],
            'Fresh GM65 MIDI bytes differ from the admitted export')
    return dict(status='PASS', melodyId=identifier, notes=len(entry['notes']),
                totalBeats=entry['totalBeats'], chords=len(entry['chords']),
                measures=len(entry['measures']), sourceSha256=digest(source),
                compilerMidiSha256=digest(compiler_midi), sourcePPQ=source_ppq,
                melodyPPQ=ppq, midiPPQ=stored.get('midiPPQ'),
                explicitCompilerOmissions=omissions, freshMidi=str(fresh_midi),
                midiSha256=digest(fresh_midi))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', required=True, type=Path)
    parser.add_argument('--lilypond', required=True)
    parser.add_argument('--work-dir', required=True, type=Path)
    args = parser.parse_args()
    source, work = args.source_dir.resolve(), args.work_dir.resolve()
    require(source.is_dir(), '--source-dir must be an extracted OpenBook tree')
    require(not inside(work, ROOT) and not inside(work, source),
            '--work-dir must be outside the repository and original source tree')
    journal_path = ROOT / 'evidence/reviewed-melody-intake.json'
    manifest_path = ROOT / 'dist/data/openbook-melodies.json'
    pool_path = ROOT / 'dist/data/melody-sources.json'
    ref_files = {name: ROOT / 'src/music' / name for name in (
        'melody-tonic-references.json', 'melody-arrangement-references.json',
        'melody-primary-voices.json', 'melody-navigation-reviews.json')}
    module_files = {name: ROOT / 'scripts' / name for name in (
        'import-openbook-melodies.py', 'openbook_navigation.py', 'openbook_tie_navigation.py')}
    watched = [journal_path, manifest_path, pool_path, ROOT / 'src/music/chord-vocabulary.json',
               ROOT / 'dist/data/roadmaps.json', *ref_files.values(), *module_files.values()]
    before = {str(path.relative_to(ROOT)): digest(path) for path in watched}
    reviews = {}
    for batch in read(journal_path)['batches']:
        for review in batch['reviews']:
            require(review['melodyId'] not in reviews, 'Duplicate journal source ID')
            reviews[review['melodyId']] = review
    manifest = {entry['id']: entry for entry in read(manifest_path)['entries']}
    pool = read(pool_path)['entries']
    require(all(identifier in pool for identifier in reviews),
            'Journaled source is missing from the current melody pool')
    lily_ids = [identifier for identifier in reviews
                if pool[identifier]['provenance']['format'] == 'LilyPond']
    require(all(identifier in manifest and manifest[identifier] == pool[identifier]
                for identifier in lily_ids), 'Journaled OpenBook manifest entry differs')
    entries = [manifest[identifier] for identifier in lily_ids]
    require(entries and all(e['provenance']['format'] == 'LilyPond' for e in entries),
            'No journaled LilyPond heads in the current OpenBook manifest')
    work.mkdir(parents=True, exist_ok=True)
    context = dict(source=source, work=work, lilypond=args.lilypond,
                   modules=tuple(load('reviewed_' + str(i), path)
                                 for i, path in enumerate(module_files.values())),
                   qualities=read(ROOT / 'src/music/chord-vocabulary.json')['qualities'],
                   canonical={song['index']: song
                              for song in read(ROOT / 'dist/data/roadmaps.json')['songs']},
                   harmonic={r['melodyId']: r for r in read(ref_files['melody-tonic-references.json'])['entries']},
                   arrangements={r['melodyId']: r for r in read(ref_files['melody-arrangement-references.json'])['entries']},
                   primary={r['melodyId']: r for r in read(ref_files['melody-primary-voices.json'])['entries']},
                   navigation={(r['sourcePath'], r['sourceVersion']): r
                               for r in read(ref_files['melody-navigation-reviews.json'])['plans']})
    records = []
    for entry in entries:
        try:
            result = verify_one(entry, reviews[entry['id']], context)
        except Exception as error:
            result = dict(status='FAIL', melodyId=entry['id'], error=str(error))
        records.append(result)
        print(json.dumps(result), flush=True)
    after = {str(path.relative_to(ROOT)): digest(path) for path in watched}
    require(before == after, 'Repository source/manifest changed during the audit')
    passed = all(record['status'] == 'PASS' for record in records)
    report = dict(status='PASS' if passed else 'FAIL', verified=len(records),
                  journaledSources=len(reviews), skippedNonOpenBook=len(reviews) - len(entries),
                  notes=sum(r.get('notes', 0) for r in records),
                  repositoryInputsUnchanged=True, repositoryInputsSha256=before,
                  records=records)
    report_path = work / 'audit.json'
    require(not report_path.is_symlink(), 'Audit output is a symlink')
    report_path.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k not in ('records', 'repositoryInputsSha256')}))
    return 0 if passed else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError) as error:
        print('Reviewed OpenBook audit: ' + str(error), file=sys.stderr)
        sys.exit(1)
