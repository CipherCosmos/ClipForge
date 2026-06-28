import { render, screen, fireEvent } from "@testing-library/react"
import { CaptionStyleSelector } from "@/components/CaptionStyleSelector"

describe("CaptionStyleSelector", () => {
  it("renders all style labels", () => {
    render(<CaptionStyleSelector value="classic" onChange={jest.fn()} />)
    expect(screen.getByText("Classic")).toBeInTheDocument()
    expect(screen.getByText("Neon")).toBeInTheDocument()
    expect(screen.getByText("Minimal")).toBeInTheDocument()
    expect(screen.getByText("Highlight")).toBeInTheDocument()
    expect(screen.getByText("Typewriter")).toBeInTheDocument()
  })

  it("highlights selected option", () => {
    render(<CaptionStyleSelector value="neon" onChange={jest.fn()} />)
    const neonBtn = screen.getByText("Neon").closest("button")!
    expect(neonBtn.className).toContain("border-brand-500")
  })

  it("calls onChange when option clicked", () => {
    const onChange = jest.fn()
    render(<CaptionStyleSelector value="classic" onChange={onChange} />)
    fireEvent.click(screen.getByText("Minimal"))
    expect(onChange).toHaveBeenCalledWith("minimal")
  })
})
