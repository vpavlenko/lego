/** Review proposals only. These deliberately do not merge source identities,
 * change routes, or claim every quotation variant has the same full sequence.
 * The exact representative definition/support is resolved from source variants
 * by the cadence-system audit before any host opts into a display rename. */
export const BRICK_NAME_PROPOSALS=[
 {slug:'autumnal',cork:"Autumnal",name:'iv iiø V',scope:'representative'},
 {slug:'dizzy',cork:"Dizzy",name:'ii ♭II7 I',scope:'representative'},
 {slug:'dogleg',cork:"Dogleg",name:'vi II7 ii V',scope:'representative'},
 {slug:'foggy',cork:"Foggy",name:'♭III7 ii V I',scope:'core'},
 {slug:'happenstance',cork:"Happenstance",name:'♯iv(ø) VII7',scope:'core'},
 {slug:'happenstance-turnaround',cork:"Happenstance Turnaround",name:'I ♯iv(ø) VII7',scope:'core'},
 {slug:'itchy-opening',cork:"ITCHY Opening",name:'I iii(ø) VI7 ii ♯iv(ø) VII7',scope:'core'},
 {slug:'light-day',cork:"Light & Day",name:'iiø ♭ii',scope:'core'},
 {slug:'lonely',cork:"Lonely",name:'♯iv VII7 ii V',scope:'core'},
 {slug:'moment-s',cork:"Moment's",name:'♭ii ♯IV7 ii V',scope:'core'},
 {slug:'night-day',cork:"Night & Day",name:'♭VIΔ V7 I',scope:'core'},
 {slug:'nobody-s',cork:"Nobody's",name:'♭IIIΔ V7 i',scope:'core'},
 {slug:'on-plus-nobody-s',cork:"On+Nobody's",name:'I III7',scope:'core'},
 {slug:'pennies',cork:"Pennies",name:'IV ♭VII7 I',scope:'core'},
 {slug:'pennies-ending',cork:"Pennies Ending",name:'IV ♭VII7 I Ending',scope:'representative'},
 {slug:'pennies-turnaround',cork:"Pennies Turnaround",name:'I IV7 iii VI7 ii V',scope:'representative'},
 {slug:'rainbow',cork:"Rainbow",name:'VΔ VII7 I',scope:'representative'},
 {slug:'rainy',cork:"Rainy",name:'iii ♭iii° ii V',scope:'representative'},
 {slug:'rainy-pullback-extended',cork:"Rainy Pullback Extended",name:'ii V iii ♭iii° ii V',scope:'core'},
 {slug:'rainy-turnaround',cork:"Rainy Turnaround",name:'I ♭iii° ii V',scope:'core'},
 {slug:'spring',cork:"Spring",name:'vii ii V',scope:'representative'},
 {slug:'starlight',cork:"Starlight",name:'♯ivø VII7 iii VI7 ii V',scope:'representative'},
 {slug:'starlight-opening',cork:"Starlight Opening",name:'♯ivø VII7 ii',scope:'representative'},
 {slug:'starlight-ttfa',cork:"Starlight TTFA",name:'♯ivø VII7 iii VI7',scope:'core'},
 {slug:'ttfa-dropback',cork:"TTFA Dropback",name:'I iii VI7',scope:'representative'},
 {slug:'wonderful-opening',cork:"Wonderful Opening",name:'I vii°/ii ii V I',scope:'core'},
 {slug:'yardbird',cork:"Yardbird",name:'iv ♭VII7 I',scope:'representative'},
 {slug:'yardbird-sub',cork:"Yardbird Sub",name:'ii iv ♭VII7 I',scope:'representative'},
 {slug:'yardbird-sub-turnaround',cork:"Yardbird Sub Turnaround",name:'I vi ♭VII7',scope:'core'}
];
export const RETAINED_QUOTATION_NAMES=['Autumn Leaves Opening','Body & Soul','Donna Lee Opening','Donna Lee Start','Honeysuckle Bridge','Ladybird Turnaround','Stablemates'];
export const DEFERRED_QUOTATION_SLUGS=['foolish','foggy-turnaround','raindrop'];

// Compound nicknames and acronyms expose a representative functional pattern;
// source identity and every alternate definition remain separate.
export const COMPOUND_DISPLAY_NAMES={
 'IV n Mack':'IV iv I',
 'IV n Back':'IV ♯iv° I',
 'IV n Hack':'IV ♯iv VII7',
 'IV n Yak':'IV {iv,♭VII7} I',
 'IV n Bird':'IV ♭VII7 iii',
 'II n Bird':'ii iv ♭VII7',
 'II n Bird POT':'ii iv ♭VII7 I (VI7) ii V',
 'II n Bird SPOT':'ii iv ♭VII7 iii VI7 ii V',
 'IV n Bird SPOT':'IV ♭VII7 iii VI7 ii (V)',
 'II n Back':'ii ♯ii° {I,iii}',
 'To IV n Back':'I I7 IV ♯iv°',
 'To IV n Mack Turnaround':'I IV iv',
 'To IV n Yak':'v I7 IV ♭VII7',
 'To IV n Bird SPOT':'I I7 IV ♭VII7 iii VI7 ii (V)',
 'Foggy Turnaround':'I ♭III7 {ii,II7} V',
 'Foolish':'{ii,V7} vii°/ii ii V',
 'Raindrop':'{I,iii,VI7} ♭iii°',
 'POT':'I (vi/VI7) ii V',
 'SPOT':'iii VI7 ii V'
};
