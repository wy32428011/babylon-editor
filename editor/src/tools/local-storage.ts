import { ProjectType, projectsKey } from "./project";

export type PlacementGridSize = "4x4" | "8x8" | "16x16";

const previewPlacementGridSizeKey = "babylonjs-editor-preview-placement-grid-size";
const placementGridSizes = new Set<PlacementGridSize>(["4x4", "8x8", "16x16"]);

/**
 * Returns the list of projects that were stored in the local storage in order to display them in the dashboard.
 * Those projects are sorted by the last updated date.
 */
export function tryGetProjectsFromLocalStorage(): ProjectType[] {
	try {
		const data = JSON.parse(localStorage.getItem(projectsKey)! ?? "[]") as ProjectType[];
		data.sort((a, b) => {
			return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
		});

		return data;
	} catch (e) {
		return [];
	}
}

/**
 * Adds the project located at the given absolute path to the local storage in order to display them in the dashboard.
 * @param absolutePath defines the absolute path to the project file to add to the local storage.
 */
export function tryAddProjectToLocalStorage(absolutePath: string): void {
	try {
		const projects = tryGetProjectsFromLocalStorage();

		localStorage.setItem(
			projectsKey,
			JSON.stringify(
				projects.concat([
					{
						absolutePath,
						createdAt: new Date(),
						updatedAt: new Date(),
					},
				])
			)
		);
	} catch (e) {
		console.error("Failed to import project.");
	}
}

/**
 * Returns wether or not experimental features are enabled in the editor.
 */
export function tryGetExperimentalFeaturesEnabledFromLocalStorage(): boolean {
	try {
		return localStorage.getItem("editor-experimental-features") === "true";
	} catch (e) {
		return false;
	}
}

/**
 * Sets whether or not experimental features are enabled in the local storage.
 * @param enabled defines wether or not experimental features are enabled.
 */
export function trySetExperimentalFeaturesEnabledInLocalStorage(enabled: boolean): void {
	try {
		localStorage.setItem("editor-experimental-features", JSON.stringify(enabled));
	} catch (e) {
		// Catch silently.
	}
}

/**
 * Returns wether or not the dashboard should be closed when a project is opened.
 */
export function tryGetCloseDashboardOnProjectOpenFromLocalStorage(): boolean {
	try {
		return localStorage.getItem("babylonjs-editor-close-dashboard-on-project-open") === "true";
	} catch (e) {
		return false;
	}
}

/**
 * Sets whether or not the dashboard should be closed when a project is opened.
 * @param enabled defines whether or not the dashboard should be closed when a project is opened.
 */
export function trySetCloseDashboardOnProjectOpenInLocalStorage(enabled: boolean): void {
	try {
		localStorage.setItem("babylonjs-editor-close-dashboard-on-project-open", JSON.stringify(enabled));
	} catch (e) {
		// Catch silently.
	}
}

/**
 * 返回低硬件占用/安全打开模式是否启用。
 */
export function tryGetSafeOpenModeFromLocalStorage(): boolean {
	try {
		return localStorage.getItem("babylonjs-editor-safe-open-mode") === "true";
	} catch (e) {
		return false;
	}
}

/**
 * 将低硬件占用/安全打开模式偏好写入本地存储。
 * @param enabled 定义是否启用低硬件占用/安全打开模式。
 */
export function trySetSafeOpenModeInLocalStorage(enabled: boolean): void {
	try {
		localStorage.setItem("babylonjs-editor-safe-open-mode", String(enabled));
	} catch (e) {
		// 静默忽略本地存储写入失败。
	}
}

/**
 * 读取预览辅助网格间距偏好，非法值回退为默认 4x4。
 */
export function tryGetPreviewPlacementGridSizeFromLocalStorage(): PlacementGridSize {
	try {
		const value = localStorage.getItem(previewPlacementGridSizeKey) as PlacementGridSize | null;
		return value && placementGridSizes.has(value) ? value : "4x4";
	} catch (e) {
		return "4x4";
	}
}

/**
 * 将预览辅助网格间距偏好写入本地存储。
 * @param size 定义需要保存的网格间距预设。
 */
export function trySetPreviewPlacementGridSizeInLocalStorage(size: PlacementGridSize): void {
	try {
		localStorage.setItem(previewPlacementGridSizeKey, size);
	} catch (e) {
		// 静默忽略本地存储写入失败。
	}
}

/**
 * Returns the terminal path stored in the local storage, or null if it fails to access the local storage or if no terminal path is stored.
 */
export function tryGetTerminalFromLocalStorage(): string | null {
	try {
		return localStorage.getItem("babylonjs-editor-terminal");
	} catch (e) {
		return null;
	}
}

/**
 * Sets the terminal path in the local storage.
 * @param terminalPath defines the terminal path to set in the local storage.
 */
export function trySetTerminalInLocalStorage(terminalPath: string): void {
	try {
		localStorage.setItem("babylonjs-editor-terminal", terminalPath);
	} catch (e) {
		// Catch silently.
	}
}
