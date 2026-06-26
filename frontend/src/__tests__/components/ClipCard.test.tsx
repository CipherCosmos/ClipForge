import { render, screen } from "@testing-library/react"
import { ClipCard } from "@/components/ClipCard"

const mockClip = {
  id: "clip-1",
  video_id: "vid-1",
  start_time: 10,
  end_time: 25,
  caption: "Test caption content",
  score: 0.75,
  file_url: "http://example.com/clip.mp4",
  thumbnail_url: null,
  title: "Amazing Clip",
  hashtags: "#viral #trending",
  created_at: "2025-01-15T10:00:00Z",
}

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

describe("ClipCard", () => {
  it("renders clip title", () => {
    render(<ClipCard clip={mockClip} />)
    expect(screen.getByText("Amazing Clip")).toBeInTheDocument()
  })

  it("renders score label", () => {
    render(<ClipCard clip={mockClip} />)
    expect(screen.getByText("High · 75")).toBeInTheDocument()
  })

  it("renders duration", () => {
    render(<ClipCard clip={mockClip} />)
    expect(screen.getByText("0:15")).toBeInTheDocument()
  })

  it("renders caption", () => {
    render(<ClipCard clip={mockClip} />)
    expect(screen.getByText("Test caption content")).toBeInTheDocument()
  })

  it("renders hashtags", () => {
    render(<ClipCard clip={mockClip} />)
    expect(screen.getByText("viral")).toBeInTheDocument()
    expect(screen.getByText("trending")).toBeInTheDocument()
  })

  it("renders publish buttons", () => {
    render(<ClipCard clip={mockClip} />)
    expect(screen.getByText("YouTube")).toBeInTheDocument()
    expect(screen.getByText("TikTok")).toBeInTheDocument()
    expect(screen.getByText("Instagram")).toBeInTheDocument()
  })

  it("renders download button", () => {
    render(<ClipCard clip={mockClip} />)
    expect(screen.getByText("Download Video")).toBeInTheDocument()
  })
})
