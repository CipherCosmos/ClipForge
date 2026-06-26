import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { VideoCard } from "@/components/VideoCard"

const mockVideo = {
  id: "vid-1",
  source_url: "http://example.com/video.mp4",
  status: "completed",
  duration: 120,
  title: "Test Video",
  language: "en",
  platform: "youtube_shorts",
  viral_score: 0.85,
  thumbnail_url: "http://example.com/thumb.jpg",
  created_at: "2025-01-15T10:00:00Z",
}

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock("@/lib/api", () => ({
  videosAPI: {
    delete: jest.fn().mockResolvedValue({}),
  },
}))

describe("VideoCard", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(window, "confirm").mockReturnValue(true)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("renders video title", () => {
    render(<VideoCard video={mockVideo} />)
    expect(screen.getByText("Test Video")).toBeInTheDocument()
  })

  it("renders duration", () => {
    render(<VideoCard video={mockVideo} />)
    expect(screen.getByText("2:00")).toBeInTheDocument()
  })

  it("renders viral score", () => {
    render(<VideoCard video={mockVideo} />)
    expect(screen.getByText("85%")).toBeInTheDocument()
  })

  it("renders platform label", () => {
    render(<VideoCard video={mockVideo} />)
    expect(screen.getByText("youtube shorts")).toBeInTheDocument()
  })

  it("calls onDelete when delete clicked", async () => {
    const onDelete = jest.fn()
    render(<VideoCard video={mockVideo} onDelete={onDelete} />)
    const deleteBtn = screen.getByTitle("Delete video")
    fireEvent.click(deleteBtn)
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith("vid-1")
    })
  })

  it("renders untitled fallback", () => {
    const noTitle = { ...mockVideo, title: null }
    render(<VideoCard video={noTitle} />)
    expect(screen.getByText("Untitled Video")).toBeInTheDocument()
  })
})
