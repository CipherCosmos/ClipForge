import { render, screen, fireEvent } from "@testing-library/react"
import { PlatformSelector } from "@/components/PlatformSelector"

jest.mock("@/lib/api", () => ({
  videosAPI: {
    platforms: jest.fn().mockRejectedValue(new Error("no api")),
  },
}))

describe("PlatformSelector", () => {
  it("renders select element with platform options", () => {
    render(<PlatformSelector value="youtube_shorts" onChange={jest.fn()} />)
    expect(screen.getByRole("combobox")).toBeInTheDocument()
  })

  it("renders all fallback platform options", () => {
    render(<PlatformSelector value="youtube_shorts" onChange={jest.fn()} />)
    const options = screen.getAllByRole("option")
    expect(options.length).toBeGreaterThanOrEqual(7)
    expect(options[0]).toHaveTextContent("YouTube Shorts")
    expect(options[2]).toHaveTextContent("TikTok")
  })

  it("calls onChange when selection changes", () => {
    const onChange = jest.fn()
    render(<PlatformSelector value="youtube_shorts" onChange={onChange} />)
    const select = screen.getByRole("combobox")
    fireEvent.change(select, { target: { value: "tiktok" } })
    expect(onChange).toHaveBeenCalledWith("tiktok")
  })

  it("shows description for selected platform", () => {
    render(<PlatformSelector value="youtube_shorts" onChange={jest.fn()} />)
    expect(screen.getByText(/Vertical 9:16/)).toBeInTheDocument()
  })
})
