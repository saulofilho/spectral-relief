// Draws the site icon (512 px, halftone mountain) and the 1200 x 630 share card.
// swift tools/brand.swift <work dir> <out dir>
// <work dir> needs og-base.png (from fm1's host renderer:
//   render -w 1200 -h 630 -planes 36 -cell 5 -height 0.3 -pattern pad -seconds 9 -marks)
// and fonts/Archivo.ttf + fonts/PlexMono.ttf (from Google Fonts).
import Foundation
import CoreGraphics
import CoreText
import ImageIO
import UniformTypeIdentifiers

let scratch = CommandLine.arguments[1], outDir = CommandLine.arguments[2]
let paper = CGColor(red: 0xE5/255, green: 0xE4/255, blue: 0xE0/255, alpha: 1)
let ink = CGColor(red: 0x26/255, green: 0x28/255, blue: 0x2D/255, alpha: 1)
let graphite = CGColor(red: 0x59/255, green: 0x5B/255, blue: 0x61/255, alpha: 1)
let blue = CGColor(red: 0x3F/255, green: 0x7F/255, blue: 0xB5/255, alpha: 1)

func context(_ w: Int, _ h: Int) -> CGContext {
    let c = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    c.translateBy(x: 0, y: CGFloat(h)); c.scaleBy(x: 1, y: -1)   // y down, like the canvas
    return c
}
func save(_ c: CGContext, _ name: String) {
    let url = URL(fileURLWithPath: outDir).appendingPathComponent(name)
    let d = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(d, c.makeImage()!, nil); CGImageDestinationFinalize(d)
}
func font(_ file: String, _ size: CGFloat, _ axes: [UInt32: CGFloat] = [:]) -> CTFont {
    let url = URL(fileURLWithPath: scratch).appendingPathComponent("fonts/" + file) as CFURL
    let desc = (CTFontManagerCreateFontDescriptorsFromURL(url) as! [CTFontDescriptor])[0]
    var f = CTFontCreateWithFontDescriptor(desc, size, nil)
    if !axes.isEmpty {
        let v = CTFontDescriptorCreateWithAttributes([kCTFontVariationAttribute: axes as NSDictionary] as CFDictionary)
        f = CTFontCreateCopyWithAttributes(f, size, nil, v)
    }
    return f
}
func text(_ c: CGContext, _ s: String, _ f: CTFont, _ col: CGColor, _ x: CGFloat, _ baseline: CGFloat, tracking: CGFloat = 0) {
    let a = NSAttributedString(string: s, attributes: [kCTFontAttributeName as NSAttributedString.Key: f,
        kCTForegroundColorAttributeName as NSAttributedString.Key: col, kCTKernAttributeName as NSAttributedString.Key: tracking])
    let line = CTLineCreateWithAttributedString(a)
    c.saveGState(); c.textMatrix = CGAffineTransform(scaleX: 1, y: -1)
    c.textPosition = CGPoint(x: x, y: baseline); CTLineDraw(line, c); c.restoreGState()
}
let WDTH: UInt32 = 0x77647468, WGHT: UInt32 = 0x77676874

// ------------------------------------------------------------------ icon
// The favicon's mountain, drawn as an AM halftone: dots on a 45 degree lattice, area = tone.
do {
    let S = 512, c = context(S, S), s = CGFloat(S) / 32
    c.setFillColor(paper); c.fill(CGRect(x: 0, y: 0, width: S, height: S))
    // silhouette from favicon.svg: M2 27 11 9 l5 8 4-6 10 16z, pulled in a little for maskable icons
    let pts: [(CGFloat, CGFloat)] = [(3.5, 25.5), (11.5, 9.5), (16, 16.5), (20, 11), (28.5, 25.5)]
    func ridgeY(_ x: CGFloat) -> CGFloat? {
        for i in 0..<(pts.count - 1) where x >= pts[i].0 && x <= pts[i + 1].0 {
            let t = (x - pts[i].0) / (pts[i + 1].0 - pts[i].0)
            return pts[i].1 + (pts[i + 1].1 - pts[i].1) * t
        }
        return nil
    }
    let pitch: CGFloat = 1.05 * s, a = pitch / sqrt(2)
    c.setFillColor(ink)
    for u in -40...80 { for v in -40...80 {
        let x = CGFloat(u - v) * a, y = CGFloat(u + v) * a
        let gx = x / s, gy = y / s + 0.8   // drawn 0.8 units higher: centred in the square
        guard gx > 0, gx < 32, gy < 25.5, let r = ridgeY(gx), gy >= r else { continue }
        let left = gx < 11.5 || (gx > 16 && gx < 20)            // faces turned to the light are paler
        var tone: CGFloat = left ? 0.42 : 0.82
        tone -= 0.35 * max(0, (gy - 21) / 4.5)                    // mist at the base
        if gy - r < 1.1 { tone = 0.95 }                           // the dark crease along the crest
        tone = min(1, max(0, tone))
        let rad = pitch * sqrt(tone / .pi) * 1.08
        if rad > 0.6 { c.fillEllipse(in: CGRect(x: x - rad, y: y - rad, width: 2 * rad, height: 2 * rad)) }
    } }
    save(c, "icon-512.png")
}

// ------------------------------------------------------------------ share card
do {
    let W = 1200, H = 630, c = context(W, H)
    let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: scratch + "/og-base.png") as CFURL, nil)!
    let img = CGImageSourceCreateImageAtIndex(src, 0, nil)!
    c.saveGState(); c.translateBy(x: 0, y: CGFloat(H)); c.scaleBy(x: 1, y: -1)
    c.draw(img, in: CGRect(x: 0, y: 0, width: W, height: H)); c.restoreGState()
    let mono = font("PlexMono.ttf", 21)
    text(c, "STUDY · MUSIC VISUALIZER FOR SYNTHESIZERS", mono, graphite, 64, 86, tracking: 1.6)
    text(c, "Spectral Relief", font("Archivo.ttf", 104, [WDTH: 125, WGHT: 850]), ink, 60, 186, tracking: -2)
    text(c, "Sound as a mountain range, printed in halftone.", font("Archivo.ttf", 30, [WDTH: 100, WGHT: 420]), ink, 64, 240)
    text(c, "saulofilho.github.io/spectral-relief", font("PlexMono.ttf", 19), blue, 64, 284)
    save(c, "og-image.png")
}
print("ok")
