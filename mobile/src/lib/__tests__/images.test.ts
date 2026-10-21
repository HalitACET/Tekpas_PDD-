import { ImageManipulator } from "expo-image-manipulator";
import { JPEG_QUALITY, MAX_EDGE, preparePage } from "../images";

jest.mock("expo-image-manipulator", () => ({ ImageManipulator: { manipulate: jest.fn() }, SaveFormat: { JPEG: "jpeg" } }));

interface FakeContext {
  renderAsync: jest.Mock;
  resize: (to: { width?: number; height?: number }) => FakeContext;
}

function fakeContext(width: number, height: number) {
  let size = { width, height };
  const save = jest.fn(async () => ({ uri: "file:///out.jpg", ...size }));
  const context: FakeContext = {
    renderAsync: jest.fn(async () => ({ ...size, saveAsync: save })),
    resize: jest.fn((to: { width?: number; height?: number }): FakeContext => {
      const scale = to.width ? to.width / size.width : (to.height ?? size.height) / size.height;
      size = { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
      return context;
    }),
  };
  (ImageManipulator.manipulate as jest.Mock).mockReturnValue(context);
  return { context, save };
}

describe("preparePage", () => {
  it("scales a large photo down to 2000 px on its long edge and saves it as compressed JPEG", async () => {
    const { context, save } = fakeContext(3024, 4032);

    const page = await preparePage("file:///photo.jpg");

    expect(context.resize).toHaveBeenCalledWith({ height: MAX_EDGE });
    expect(save).toHaveBeenCalledWith({ format: "jpeg", compress: JPEG_QUALITY });
    expect(page).toEqual({ uri: "file:///out.jpg", width: 1500, height: 2000 });
  });

  it("scales a wide photo by its width and never enlarges a small one", async () => {
    const wide = fakeContext(4000, 3000);
    await preparePage("file:///wide.jpg");
    expect(wide.context.resize).toHaveBeenCalledWith({ width: MAX_EDGE });

    const small = fakeContext(1200, 1600);
    const page = await preparePage("file:///small.jpg");
    expect(small.context.resize).not.toHaveBeenCalled();
    expect(page.height).toBe(1600);
  });
});
