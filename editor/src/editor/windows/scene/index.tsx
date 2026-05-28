import { dirname } from "path/posix";
import { ipcRenderer } from "electron";

import { Component, ReactNode } from "react";

import { restoreCadGroundReferences } from "../../../project/load/cad";
import { loadScene } from "../../../project/load/scene";
import { tryGetSafeOpenModeFromLocalStorage } from "../../../tools/local-storage";
import { onProjectConfigurationChangedObservable, projectConfiguration } from "../../../project/configuration";

import { waitUntil } from "../../../tools/tools";
import { onProjectSavedObservable } from "../../../tools/observables";

import { Editor } from "../../main";

export interface ISceneEditorWindowProps {
	appPath: string;
	scenePath: string;
	projectPath: string;
}

export default class SceneEditorWindow extends Component<ISceneEditorWindowProps> {
	private _editor: Editor | null = null;

	public constructor(props: ISceneEditorWindowProps) {
		super(props);
	}

	public render(): ReactNode {
		return <Editor ref={(r) => (this._editor = r)} projectPath={this.props.projectPath} editedScenePath={this.props.scenePath} />;
	}

	public async componentDidMount(): Promise<void> {
		if (!this._editor) {
			return;
		}

		this._editor.path = this.props.appPath;

		await waitUntil(() => this._editor!.layout?.preview?.scene);

		projectConfiguration.path = this.props.projectPath;
		onProjectConfigurationChangedObservable.notifyObservers(projectConfiguration);

		const safeMode = tryGetSafeOpenModeFromLocalStorage();

		this._editor.setState({
			lastOpenedScenePath: this.props.scenePath,
			safeOpenMode: safeMode,
		});

		const directory = dirname(this.props.projectPath);

		await loadScene(this._editor, directory, this.props.scenePath, { safeMode });
		await restoreCadGroundReferences(this._editor, this._editor.layout.preview.scene, directory);

		this._editor.layout.graph.refresh();
		this._editor.layout.inspector.setEditedObject(this._editor.layout.preview.scene);

		onProjectSavedObservable.add(() => {
			ipcRenderer.send("editor:asset-updated", "scene", this.props.scenePath);
		});
	}
}
