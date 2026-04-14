import {
  derivePptStatus,
  isMatchingSlideReadyEvent,
} from "@/components/project/features/studio/panel/usePptHistoryStatusSync";

describe("studio ppt history status sync", () => {
  it("maps drafting/awaiting states to outline statuses", () => {
    expect(
      derivePptStatus({
        sessionState: "DRAFTING_OUTLINE",
        runStatus: "pending",
        runStep: "outline",
        hasSlideReadyEvent: false,
      })
    ).toMatchObject({
      status: "draft",
      step: "outline",
      ppt_status: "outline_generating",
      terminal: false,
    });

    expect(
      derivePptStatus({
        sessionState: "AWAITING_OUTLINE_CONFIRM",
        runStatus: "pending",
        runStep: "outline",
        hasSlideReadyEvent: false,
      })
    ).toMatchObject({
      status: "draft",
      step: "outline",
      ppt_status: "outline_pending_confirm",
      terminal: false,
    });
  });

  it("maps generating/rendering with no slide event to slides_generating", () => {
    expect(
      derivePptStatus({
        sessionState: "GENERATING_CONTENT",
        runStatus: "processing",
        runStep: "generate",
        hasSlideReadyEvent: false,
      })
    ).toMatchObject({
      status: "processing",
      step: "preview",
      ppt_status: "slides_generating",
      terminal: false,
    });
  });

  it("maps slide-generated event to slide_preview_ready", () => {
    expect(
      derivePptStatus({
        sessionState: "GENERATING_CONTENT",
        runStatus: "processing",
        runStep: "generate",
        hasSlideReadyEvent: true,
      })
    ).toMatchObject({
      status: "previewing",
      step: "preview",
      ppt_status: "slide_preview_ready",
      terminal: false,
    });
  });

  it("maps terminal success/failed states", () => {
    expect(
      derivePptStatus({
        sessionState: "SUCCESS",
        runStatus: "completed",
        runStep: "completed",
        hasSlideReadyEvent: true,
      })
    ).toMatchObject({
      status: "completed",
      step: "preview",
      terminal: true,
    });

    expect(
      derivePptStatus({
        sessionState: "FAILED",
        runStatus: "failed",
        runStep: "generate",
        hasSlideReadyEvent: true,
      })
    ).toMatchObject({
      status: "failed",
      step: "preview",
      terminal: true,
    });
  });

  it("matches slide-ready event only for the same run id", () => {
    const matchingEvent = {
      event_type: "ppt.slide.generated",
      payload: { run_id: "run-1", slide_no: 1 },
    };
    const otherRunEvent = {
      event_type: "ppt.slide.generated",
      payload: { run_id: "run-2", slide_no: 1 },
    };
    expect(isMatchingSlideReadyEvent(matchingEvent, "run-1")).toBe(true);
    expect(isMatchingSlideReadyEvent(otherRunEvent, "run-1")).toBe(false);
  });
});

