import { afterEach, expect, test, vi } from "vitest";
import { createLocaleDictationAdapter } from "./dictation";

class FakeSpeechRecognition extends EventTarget {
  static instances: FakeSpeechRecognition[] = [];
  continuous = false;
  interimResults = false;
  lang = "";

  constructor() {
    super();
    FakeSpeechRecognition.instances.push(this);
  }

  start() {
    this.dispatchEvent(new Event("start"));
  }

  stop() {
    this.dispatchEvent(new Event("end"));
  }

  abort() {}
}

afterEach(() => {
  FakeSpeechRecognition.instances = [];
  vi.unstubAllGlobals();
});

test("uses the active Chinese locale for browser speech recognition", () => {
  vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition);

  const adapter = createLocaleDictationAdapter("zh-CN", {
    onError: () => undefined,
    onStart: () => undefined,
  });
  const session = adapter.listen();

  expect(FakeSpeechRecognition.instances[0]?.lang).toBe("zh-CN");
  session.cancel();
});

test("reports unsupported browsers instead of failing silently", () => {
  const onError = vi.fn();
  const adapter = createLocaleDictationAdapter("zh-CN", {
    onError,
    onStart: () => undefined,
  });

  expect(() => adapter.listen()).toThrow("SpeechRecognition is not supported");
  expect(onError).toHaveBeenCalledWith("unsupported");
});
