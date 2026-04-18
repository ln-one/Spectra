import { initialTransition, transition } from "xstate";
import { simulationWorkflowMachine } from "@/components/project/features/studio/tools/SimulationToolPanel";

describe("simulation workflow machine", () => {
  it("transitions result_available -> continuing -> result_available", () => {
    const initial = initialTransition(simulationWorkflowMachine)[0];
    const preview = transition(simulationWorkflowMachine, initial, {
      type: "PREVIEW",
    })[0];
    const result = transition(simulationWorkflowMachine, preview, {
      type: "RESULT",
    })[0];
    const continuing = transition(simulationWorkflowMachine, result, {
      type: "CONTINUE",
    })[0];
    const settled = transition(simulationWorkflowMachine, continuing, {
      type: "RESULT",
    })[0];

    expect(String(result.value)).toBe("result_available");
    expect(String(continuing.value)).toBe("continuing");
    expect(String(settled.value)).toBe("result_available");
  });
});
