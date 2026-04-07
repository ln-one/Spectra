import { fireEvent, render, screen } from "@testing-library/react";
import { ReferencesTab } from "@/components/project/features/library/tabs/ReferencesTab";

describe("ReferencesTab library candidates", () => {
  it("renders available libraries and supports quick add", () => {
    const onQuickAddReference = jest.fn();

    render(
      <ReferencesTab
        projectId="proj_current"
        references={[]}
        state={{ loading: false, error: null }}
        librariesState={{ loading: false, error: null }}
        currentLibraryState={{ loading: false, error: null }}
        availableLibraries={[
          {
            id: "proj_lib_math",
            name: "数学公共库",
            description: "教材与例题",
            status: "in_progress",
            visibility: "shared",
            isReferenceable: true,
            currentVersionId: "ver_1",
          },
        ]}
        currentLibrarySettings={{
          id: "proj_current",
          name: "当前库",
          description: "desc",
          gradeLevel: null,
          visibility: "shared",
          isReferenceable: true,
        }}
        currentLibrarySaving={false}
        currentLibraryNameDraft="当前库"
        setCurrentLibraryNameDraft={jest.fn()}
        currentLibraryDescriptionDraft="desc"
        setCurrentLibraryDescriptionDraft={jest.fn()}
        currentLibraryGradeLevelDraft=""
        setCurrentLibraryGradeLevelDraft={jest.fn()}
        currentLibraryVisibilityDraft="shared"
        setCurrentLibraryVisibilityDraft={jest.fn()}
        currentLibraryReferenceableDraft={true}
        setCurrentLibraryReferenceableDraft={jest.fn()}
        onResetCurrentLibraryDrafts={jest.fn()}
        newReferenceTarget=""
        setNewReferenceTarget={jest.fn()}
        newReferenceRelationType="auxiliary"
        setNewReferenceRelationType={jest.fn()}
        newReferenceMode="follow"
        setNewReferenceMode={jest.fn()}
        newReferencePinnedVersion=""
        setNewReferencePinnedVersion={jest.fn()}
        newReferencePriority="10"
        setNewReferencePriority={jest.fn()}
        onAddReference={jest.fn()}
        onDeleteReference={jest.fn()}
        onToggleReferenceStatus={jest.fn()}
        onUpdateReferencePriority={jest.fn()}
        onQuickAddReference={onQuickAddReference}
        onReload={jest.fn()}
        onReloadLibraries={jest.fn()}
        onReloadCurrentLibrarySettings={jest.fn()}
        onSaveCurrentLibrarySettings={jest.fn()}
      />
    );

    expect(screen.getByText("库列表（数据库）")).toBeInTheDocument();
    expect(screen.getByText("数学公共库")).toBeInTheDocument();

    const importButtons = screen.getAllByRole("button", { name: "引入" });
    fireEvent.click(importButtons[1]);

    expect(onQuickAddReference).toHaveBeenCalledWith("proj_lib_math", {
      pinnedVersionId: "ver_1",
    });
  });

  it("disables quick add when target library is not referenceable", () => {
    const onQuickAddReference = jest.fn();

    render(
      <ReferencesTab
        projectId="proj_current"
        references={[]}
        state={{ loading: false, error: null }}
        librariesState={{ loading: false, error: null }}
        currentLibraryState={{ loading: false, error: null }}
        availableLibraries={[
          {
            id: "proj_lib_private",
            name: "私有库",
            description: "不可引用示例",
            status: "draft",
            visibility: "private",
            isReferenceable: false,
            currentVersionId: null,
          },
        ]}
        currentLibrarySettings={{
          id: "proj_current",
          name: "当前库",
          description: "desc",
          gradeLevel: null,
          visibility: "shared",
          isReferenceable: true,
        }}
        currentLibrarySaving={false}
        currentLibraryNameDraft="当前库"
        setCurrentLibraryNameDraft={jest.fn()}
        currentLibraryDescriptionDraft="desc"
        setCurrentLibraryDescriptionDraft={jest.fn()}
        currentLibraryGradeLevelDraft=""
        setCurrentLibraryGradeLevelDraft={jest.fn()}
        currentLibraryVisibilityDraft="shared"
        setCurrentLibraryVisibilityDraft={jest.fn()}
        currentLibraryReferenceableDraft={true}
        setCurrentLibraryReferenceableDraft={jest.fn()}
        onResetCurrentLibraryDrafts={jest.fn()}
        newReferenceTarget=""
        setNewReferenceTarget={jest.fn()}
        newReferenceRelationType="auxiliary"
        setNewReferenceRelationType={jest.fn()}
        newReferenceMode="follow"
        setNewReferenceMode={jest.fn()}
        newReferencePinnedVersion=""
        setNewReferencePinnedVersion={jest.fn()}
        newReferencePriority="10"
        setNewReferencePriority={jest.fn()}
        onAddReference={jest.fn()}
        onDeleteReference={jest.fn()}
        onToggleReferenceStatus={jest.fn()}
        onUpdateReferencePriority={jest.fn()}
        onQuickAddReference={onQuickAddReference}
        onReload={jest.fn()}
        onReloadLibraries={jest.fn()}
        onReloadCurrentLibrarySettings={jest.fn()}
        onSaveCurrentLibrarySettings={jest.fn()}
      />
    );

    const importButtons = screen.getAllByRole("button", { name: "引入" });
    const quickAddButton = importButtons[1];
    expect(quickAddButton).toBeDisabled();
    expect(screen.getAllByText("私有").length).toBeGreaterThan(0);
    expect(screen.queryByText("visibility: private")).not.toBeInTheDocument();

    fireEvent.click(quickAddButton);
    expect(onQuickAddReference).not.toHaveBeenCalled();
  });
});
