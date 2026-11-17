// per image: OCR words (with heights + boxes), face count + largest face area, human body count
import Foundation; import Vision; import AppKit
for p in CommandLine.arguments.dropFirst() {
  var words: [[String: Any]] = []; var faces: [Double] = []; var faceX: [Double] = []; var people = 0
  if let img = NSImage(contentsOfFile: p), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) {
    let t = VNRecognizeTextRequest(); t.recognitionLevel = .accurate; t.usesLanguageCorrection = false; t.minimumTextHeight = 0.03
    let f = VNDetectFaceRectanglesRequest(); let h = VNDetectHumanRectanglesRequest()
    try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([t, f, h])
    for o in (t.results ?? []) { if let c = o.topCandidates(1).first, c.confidence > 0.4 { let b = o.boundingBox; words.append(["t": c.string, "h": b.height, "x": b.midX, "y": b.midY]) } }
    for o in (f.results ?? []) where o.confidence > 0.6 { faces.append(Double(o.boundingBox.width * o.boundingBox.height)); faceX.append(Double(o.boundingBox.midX)) }
    people = (h.results ?? []).count
  }
  let d = try! JSONSerialization.data(withJSONObject: ["f": (p as NSString).lastPathComponent, "words": words, "faces": faces, "faceX": faceX, "people": people])
  print(String(data: d, encoding: .utf8)!)
}
