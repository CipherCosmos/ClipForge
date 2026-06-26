import { render, screen } from "@testing-library/react"
import { AppSidebar } from "@/components/Sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/app",
}))

jest.mock("react-redux", () => ({
  useSelector: (f: any) => f({ auth: { user: { email: "test@test.com" } } }),
  useDispatch: () => jest.fn(),
}))

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  })
})

describe("Sidebar", () => {
  it("renders nav links", () => {
    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    )
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("New Project").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Research & Trends").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("API Keys").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Settings").length).toBeGreaterThanOrEqual(1)
  })

  it("renders logout button", () => {
    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    )
    const logoutButtons = screen.getAllByText("Logout")
    expect(logoutButtons.length).toBeGreaterThanOrEqual(1)
  })

  it("shows user email when rendered", () => {
    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    )
    const emails = screen.getAllByText("test@test.com")
    expect(emails.length).toBeGreaterThanOrEqual(1)
  })
})
