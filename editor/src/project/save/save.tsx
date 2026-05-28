import { dirname } from "path/posix";
import { writeJSON } from "fs-extra";
import { ipcRenderer } from "electron";

import { toast } from "sonner";

import packageJson from "../../../package.json";

import { Editor } from "../../editor/main";

import { IEditorProject } from "../typings";

// import { exportProject } from "../export/export";

import { projectsKey } from "../../tools/project";
import { runWithoutCadGeneratedTransformNodes } from "../../tools/cad/ground-importer";
import { onProjectSavedObservable } from "../../tools/observables";
import { getBase64SceneScreenshot } from "../../tools/scene/screenshot";
import { tryGetProjectsFromLocalStorage } from "../../tools/local-storage";

import { projectConfiguration } from "../configuration";

import { saveScene } from "./scene";
import { guardProjectSaveWrite } from "./safe-mode";
import { EditorSaveProjectProgressComponent } from "./progress";

let saving = false;

export async function saveProject(editor: Editor): Promise<boolean> {
	if (saving) {
		return false;
	}

	if (!guardProjectSaveWrite(editor)) {
		return false;
	}

	saving = true;

	try {
		return await _saveProject(editor);
	} catch (e) {
		if (e instanceof Error) {
			editor.layout.console.error(`Error saving project:\n ${e.message}`);
			toast.error("保存项目时出错");
		}

		return false;
	} finally {
		saving = false;
		editor.layout.preview.setRenderScene(true);
	}
}

export async function saveProjectConfiguration(editor: Editor): Promise<Partial<IEditorProject> | null> {
	if (!guardProjectSaveWrite(editor)) {
		return null;
	}

	const project: Partial<IEditorProject> = {
		plugins: editor.state.plugins.map((plugin) => ({
			nameOrPath: plugin,
		})),
		version: packageJson.version,
		space: projectConfiguration.space,
		packageManager: editor.state.packageManager,
		lastOpenedScene: editor.state.lastOpenedScenePath?.replace(dirname(editor.state.projectPath!), ""),

		compressedTexturesEnabled: editor.state.compressedTexturesEnabled,
		compressedTexturesEnabledInPreview: editor.state.compressedTexturesEnabledInPreview,

		gizmoSnap: editor.layout.preview?.state.gizmoSnap,
	};

	if (!editor.props.editedScenePath) {
		await writeJSON(editor.state.projectPath!, project, {
			spaces: 4,
		});
	}

	return project;
}

async function _saveProject(editor: Editor): Promise<boolean> {
	if (!editor.state.projectPath) {
		return false;
	}

	const toastId = toast(<EditorSaveProjectProgressComponent />, {
		duration: Infinity,
		dismissible: false,
	});

	const directory = dirname(editor.state.projectPath);
	const project = await saveProjectConfiguration(editor);
	if (!project) {
		toast.dismiss(toastId);
		return false;
	}

	if (editor.state.lastOpenedScenePath) {
		editor.layout.console.log(`Saving project "${project.lastOpenedScene}"`);
		const sceneSaved = await runWithoutCadGeneratedTransformNodes(editor.layout.preview.scene, () => saveScene(editor, directory, editor.state.lastOpenedScenePath!));
		if (!sceneSaved) {
			toast.dismiss(toastId);
			return false;
		}

		editor.layout.console.log(`Project "${project.lastOpenedScene}" saved.`);
	}

	toast.dismiss(toastId);
	toast.success("项目已保存");

	if (!editor.props.editedScenePath) {
		try {
			const base64 = await editor.layout.preview.withPlacementGridHidden(() => getBase64SceneScreenshot(editor.layout.preview.scene));

			const projects = tryGetProjectsFromLocalStorage();
			const project = projects.find((project) => project.absolutePath === editor.state.projectPath);
			if (project) {
				project.preview = base64;
				project.updatedAt = new Date();

				localStorage.setItem(projectsKey, JSON.stringify(projects));
				ipcRenderer.send("dashboard:update-projects");
			}
		} catch (e) {
			// Catch silently.
		}
	}

	try {
		onProjectSavedObservable.notifyObservers();
	} catch (e) {
		// Catch silently.
	}

	return true;

	// exportProject(editor, {
	// 	optimize: false,
	// 	noProgress: true,
	// 	noDialog: false,
	// });
}
