#import <Foundation/Foundation.h>
#import <Vision/Vision.h>
int main(int argc, const char *argv[]) {
 @autoreleasepool {
  NSString *input=@(argv[1]), *output=@(argv[2]);
  [[NSFileManager defaultManager] createDirectoryAtPath:output withIntermediateDirectories:YES attributes:nil error:nil];
  NSArray *files=[[[NSFileManager defaultManager] contentsOfDirectoryAtPath:input error:nil] sortedArrayUsingSelector:@selector(compare:)];
  int i=0;
  for (NSString *file in files) { @autoreleasepool {
   if (![file hasSuffix:@".png"]) continue;
   NSString *dest=[output stringByAppendingPathComponent:[[file stringByDeletingPathExtension] stringByAppendingString:@".json"]];
   if ([[NSFileManager defaultManager] fileExistsAtPath:dest]) continue;
   VNRecognizeTextRequest *req=[[VNRecognizeTextRequest alloc] init];
   req.recognitionLevel=VNRequestTextRecognitionLevelAccurate;req.usesLanguageCorrection=NO;req.minimumTextHeight=0.006;
   req.recognitionLanguages=@[@"en-US"];
   VNImageRequestHandler *handler=[[VNImageRequestHandler alloc] initWithURL:[NSURL fileURLWithPath:[input stringByAppendingPathComponent:file]] options:@{}];
   NSError *error=nil;
   if (![handler performRequests:@[req] error:&error]){NSLog(@"%@",error);return 1;}
   NSMutableArray *data=[NSMutableArray array];
   for (VNRecognizedTextObservation *obs in req.results) {
    VNRecognizedText *text=[[obs topCandidates:1] firstObject];CGRect b=obs.boundingBox;
    [data addObject:@{@"text":text.string,@"confidence":@(text.confidence),@"x":@(b.origin.x),@"y":@(1-b.origin.y-b.size.height),@"w":@(b.size.width),@"h":@(b.size.height)}];
   }
   [[NSJSONSerialization dataWithJSONObject:data options:NSJSONWritingPrettyPrinted error:nil] writeToFile:dest atomically:YES];
   if(i++%20==0){printf("Vision %d: %s\n",i,[file UTF8String]);fflush(stdout);}
  }}
 }
 return 0;
}
