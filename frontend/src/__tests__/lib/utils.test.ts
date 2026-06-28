import { cn, formatDuration, formatScore } from "@/lib/utils"

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2")
  })

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "extra")).toBe("base extra")
  })

  it("resolves tailwind conflicts", () => {
    expect(cn("px-4", "px-6")).toBe("px-6")
  })
})

describe("formatDuration", () => {
  it("formats zero", () => {
    expect(formatDuration(0)).toBe("0:00")
  })

  it("formats seconds only", () => {
    expect(formatDuration(45)).toBe("0:45")
  })

  it("formats minutes and seconds", () => {
    expect(formatDuration(125)).toBe("2:05")
  })

  it("formats hours", () => {
    expect(formatDuration(3661)).toBe("61:01")
  })
})

describe("formatScore", () => {
  it("formats 0.0 to 0", () => {
    expect(formatScore(0)).toBe("0")
  })

  it("formats 0.5 to 50", () => {
    expect(formatScore(0.5)).toBe("50")
  })

  it("formats 0.856 to 86", () => {
    expect(formatScore(0.856)).toBe("86")
  })

  it("formats 1.0 to 100", () => {
    expect(formatScore(1)).toBe("100")
  })
})
