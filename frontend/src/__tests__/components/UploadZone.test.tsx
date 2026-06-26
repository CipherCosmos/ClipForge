import { render, screen, fireEvent } from "@testing-library/react"
import { UploadZone } from "@/components/UploadZone"

function createFile(name: string, type: string, size = 1024): File {
  const file = new File(["x"], name, { type })
  Object.defineProperty(file, "size", { value: size })
  return file
}

function getFileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement
}

describe("UploadZone", () => {
  it("renders upload prompt", () => {
    render(<UploadZone onFile={jest.fn()} />)
    expect(screen.getByText(/Drop your video here/i)).toBeInTheDocument()
  })

  it("shows busy state", () => {
    render(<UploadZone onFile={jest.fn()} busy={true} />)
    expect(screen.getByText("Uploading...")).toBeInTheDocument()
  })

  it("calls onFile with valid file", () => {
    const onFile = jest.fn()
    render(<UploadZone onFile={onFile} />)
    const file = createFile("test.mp4", "video/mp4")
    fireEvent.change(getFileInput(), { target: { files: [file] } })
    expect(onFile).toHaveBeenCalledWith(file)
  })

  it("shows error for oversized file", () => {
    const onFile = jest.fn()
    render(<UploadZone onFile={onFile} />)
    const bigFile = createFile("big.mp4", "video/mp4", 3 * 1024 * 1024 * 1024)
    fireEvent.change(getFileInput(), { target: { files: [bigFile] } })
    expect(onFile).not.toHaveBeenCalled()
    expect(screen.getByText(/2GB limit/i)).toBeInTheDocument()
  })

  it("shows error for unsupported format", () => {
    const onFile = jest.fn()
    render(<UploadZone onFile={onFile} />)
    const badFile = createFile("test.exe", "application/x-msdownload")
    fireEvent.change(getFileInput(), { target: { files: [badFile] } })
    expect(onFile).not.toHaveBeenCalled()
    expect(screen.getByText(/Unsupported file format/i)).toBeInTheDocument()
  })

  it("handles drag events visually", () => {
    render(<UploadZone onFile={jest.fn()} />)
    const zone = screen.getByText(/Drop your video here/i).parentElement!
    fireEvent.dragOver(zone)
    expect(zone.className).toContain("border-brand-500")
    fireEvent.dragLeave(zone)
    expect(zone.className).not.toContain("border-brand-500")
  })

  it("calls onFile on drop", () => {
    const onFile = jest.fn()
    render(<UploadZone onFile={onFile} />)
    const zone = screen.getByText(/Drop your video here/i).parentElement!
    const file = createFile("drop.mp4", "video/mp4")
    fireEvent.drop(zone, { dataTransfer: { files: [file] } })
    expect(onFile).toHaveBeenCalledWith(file)
  })
})
