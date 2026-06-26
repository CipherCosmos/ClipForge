import { renderHook, act } from "@testing-library/react"
import { useVideoProgress } from "@/hooks/useVideoProgress"

const mockDispatch = jest.fn()
jest.mock("react-redux", () => ({
  useSelector: () => ({}),
  useDispatch: () => mockDispatch,
}))

jest.mock("@/store/videoSlice", () => ({
  fetchVideo: (args: any) => ({ type: "videos/fetchVideo", payload: args, meta: { arg: args } }),
}))

jest.mock("@/store/clipSlice", () => ({
  fetchClips: (args: any) => ({ type: "clips/fetchClips", payload: args }),
}))

beforeEach(() => {
  jest.clearAllMocks()
  global.WebSocket = jest.fn().mockImplementation(() => ({
    close: jest.fn(),
    addEventListener: jest.fn(),
    send: jest.fn(),
  })) as any
  Object.assign(global.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 })
  Object.defineProperty(window, "location", {
    value: { protocol: "http:", host: "localhost:3000" },
    writable: true,
  })
  localStorage.setItem("token", "test-token")
})

describe("useVideoProgress", () => {
  it("returns initial state", () => {
    const { result } = renderHook(() => useVideoProgress(null))
    expect(result.current.state.status).toBe("pending")
    expect(result.current.state.progress).toBe(0)
    expect(result.current.state.message).toBe("Waiting...")
    expect(result.current.completed).toBe(false)
    expect(result.current.error).toBe("")
  })

  it("attempts WebSocket connection for valid videoId", () => {
    const { result } = renderHook(() => useVideoProgress("vid-1"))
    expect(WebSocket).toHaveBeenCalled()
  })

  it("does not connect WebSocket without videoId", () => {
    renderHook(() => useVideoProgress(null))
    expect(WebSocket).not.toHaveBeenCalled()
  })

  it("does not connect WebSocket without token", () => {
    localStorage.removeItem("token")
    renderHook(() => useVideoProgress("vid-1"))
    expect(WebSocket).not.toHaveBeenCalled()
  })

  it("cleans up on unmount", () => {
    const closeMock = jest.fn()
    global.WebSocket = jest.fn().mockImplementation(() => ({
      close: closeMock,
      addEventListener: jest.fn(),
      send: jest.fn(),
    })) as any
    Object.assign(global.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 })
    const { unmount } = renderHook(() => useVideoProgress("vid-1"))
    unmount()
    // WebSocket should be closed on cleanup
    expect(closeMock).toHaveBeenCalled()
  })
})
