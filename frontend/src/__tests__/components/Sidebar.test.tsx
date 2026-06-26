import { render, screen, fireEvent } from "@testing-library/react"
import { Sidebar } from "@/components/Sidebar"

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/app",
}))

jest.mock("react-redux", () => ({
  useSelector: (f: any) => f({ auth: { user: { email: "test@test.com" } } }),
  useDispatch: () => jest.fn(),
}))

describe("Sidebar", () => {
  it("renders nav links", () => {
    render(<Sidebar collapsed={false} onToggle={jest.fn()} />)
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("New Project").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Research & Trends").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("API Keys").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Settings").length).toBeGreaterThanOrEqual(1)
  })

  it("renders logout button", () => {
    render(<Sidebar collapsed={false} onToggle={jest.fn()} />)
    const logoutButtons = screen.getAllByText("Logout")
    expect(logoutButtons.length).toBeGreaterThanOrEqual(1)
  })

  it("renders collapsed state without labels", () => {
    render(<Sidebar collapsed={true} onToggle={jest.fn()} />)
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument()
  })

  it("shows user email when not collapsed", () => {
    render(<Sidebar collapsed={false} onToggle={jest.fn()} />)
    const emails = screen.getAllByText("test@test.com")
    expect(emails.length).toBeGreaterThanOrEqual(1)
  })
})
