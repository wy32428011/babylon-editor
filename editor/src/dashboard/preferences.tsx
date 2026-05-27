import { join } from "path";
import { pathExistsSync } from "fs-extra";

import { useEffect, useState } from "react";

import { Button } from "../ui/shadcn/ui/button";
import { Switch } from "../ui/shadcn/ui/switch";
import { Separator } from "../ui/shadcn/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/shadcn/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/shadcn/ui/dialog";

import { isWindows } from "../tools/os";
import { tryGetSafeOpenModeFromLocalStorage, tryGetTerminalFromLocalStorage, trySetSafeOpenModeInLocalStorage, trySetTerminalInLocalStorage } from "../tools/local-storage";

export interface IDashboardPreferencesProps {
	isOpened: boolean;
	onClose: () => void;

	closeDashboardOnProjectOpen: boolean;
	onKeepDashboardChanged: (checked: boolean) => void;
}

export function DashboardPreferences(props: IDashboardPreferencesProps) {
	const [cmdPath, setCmdPath] = useState<string | null>(null);
	const [powerShellPath, setPowerShellPath] = useState<string | null>(null);

	const [selectedTerminal, setSelectedTerminal] = useState<string>(tryGetTerminalFromLocalStorage() ?? "");
	const [safeOpenMode, setSafeOpenMode] = useState<boolean>(tryGetSafeOpenModeFromLocalStorage());

	const safeOpenModeSwitchId = "safe-open-mode-switch";
	const safeOpenModeDescriptionId = "safe-open-mode-description";

	useEffect(() => {
		if (isWindows()) {
			const systemRoot = process.env.SystemRoot || process.env.WINDIR;
			if (systemRoot) {
				const cmdPath = join(systemRoot, "System32", "cmd.exe");
				if (pathExistsSync(cmdPath)) {
					setCmdPath(cmdPath);
				}

				const powershellPath = join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
				if (pathExistsSync(powershellPath)) {
					setPowerShellPath(powershellPath);
				}
			}
		}
	}, []);

	function handleTerminalChanged(value: string): void {
		setSelectedTerminal(value);
		trySetTerminalInLocalStorage(value);
	}

	function handleSafeOpenModeChanged(enabled: boolean): void {
		setSafeOpenMode(enabled);
		trySetSafeOpenModeInLocalStorage(enabled);
	}

	return (
		<Dialog open={props.isOpened} onOpenChange={(o) => !o && props.onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>偏好设置</DialogTitle>
				</DialogHeader>

				<div className="flex flex-col gap-4 w-full py-4">
					<div className="flex flex-col gap-2">
						<div className="text-muted-foreground">
							禁用后，项目启动时仪表盘会保持打开。
							<br />
							启用后，项目启动时仪表盘会关闭，并在项目关闭后重新打开。
						</div>
						<div className="flex items-center gap-4 w-full cursor-pointer" onClick={() => props.onKeepDashboardChanged(!props.closeDashboardOnProjectOpen)}>
							<div className="text-start w-full">打开项目后关闭仪表盘</div>
							<div className="flex justify-end">
								<Switch checked={props.closeDashboardOnProjectOpen} />
							</div>
						</div>
					</div>

					<Separator />

					<div className="flex flex-col gap-2">
						<div id={safeOpenModeDescriptionId} className="text-muted-foreground">
							启用后，打开项目时会降低预览渲染压力，并跳过阴影、粒子、后处理和材质预编译等高占用步骤，适合打开项目黑屏或显卡驱动不稳定时使用。
						</div>
						<div className="flex items-center gap-4 w-full">
							<label htmlFor={safeOpenModeSwitchId} className="text-start w-full cursor-pointer">
								低硬件占用/安全打开模式
							</label>
							<div className="flex justify-end">
								<Switch id={safeOpenModeSwitchId} checked={safeOpenMode} aria-describedby={safeOpenModeDescriptionId} onCheckedChange={handleSafeOpenModeChanged} />
							</div>
						</div>
					</div>

					{isWindows() && (
						<>
							<Separator />

							<div className="flex flex-col gap-2">
								<div className="text-muted-foreground">
									Windows 默认可能使用 PowerShell 作为终端。PowerShell 默认禁用脚本执行，可能影响 Babylon.js Editor。 可以将默认终端切换为 CMD 来避免此问题。
								</div>

								<div className="flex items-center gap-4 w-full">
									<div className="w-1/3">终端</div>
									<Select value={selectedTerminal} onValueChange={(v) => handleTerminalChanged(v)}>
										<SelectTrigger className="w-2/3">
											<SelectValue placeholder="选择终端..." />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="Automatic">
												<div className="flex items-center gap-2">自动</div>
											</SelectItem>

											{cmdPath && (
												<SelectItem value={cmdPath}>
													<div className="flex items-center gap-2">CMD.exe</div>
												</SelectItem>
											)}
											{powerShellPath && (
												<SelectItem value={powerShellPath}>
													<div className="flex items-center gap-2">PowerShell.exe</div>
												</SelectItem>
											)}
										</SelectContent>
									</Select>
								</div>
							</div>
						</>
					)}
				</div>

				<DialogFooter>
					<Button variant="secondary" className="w-24" onClick={props.onClose}>
						关闭
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
