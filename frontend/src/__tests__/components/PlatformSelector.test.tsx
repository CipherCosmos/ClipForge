import { render, screen, fireEvent } from "@testing-library/react"
import { PlatformSelector } from "@/components/PlatformSelector"

jest.mock("@/lib/api", () => ({
  videosAPI: {
    platforms: jest.fn().mockRejectedValue(new Error("no api")),
  },
}))

describe("PlatformSelector", () => {
  it("renders button elements for platform options", () => {
    render(<PlatformSelector value="youtube_shorts" onChange={jest.fn()} />)
    expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(7)
  })

  it("renders all fallback platform options", () => {
    render(<PlatformSelector value="youtube_shorts" onChange={jest.fn()} />)
    expect(screen.getByText("YouTube Shorts")).toBeInTheDocument()
    expect(screen.getByText("TikTok")).toBeInTheDocument()
    expect(screen.getByText("Instagram Reels")).toBeInTheDocument()
  })

  it("calls onChange when a platform card is clicked", () => {
    const onChange = jest.fn()
    render(<PlatformSelector value="youtube_shorts" onChange={onChange} />)
    const button = screen.getByRole("button", { name: /TikTok/ })
    fireEvent.click(button)
    expect(onChange).toHaveBeenCalledWith("tiktok")
  })
})
