import { FaGear } from "react-icons/fa6";

import { Label } from "../../../../ui/shadcn/ui/label";
import { Button } from "../../../../ui/shadcn/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../../../ui/shadcn/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../ui/shadcn/ui/select";

import { CinematicEditor } from "../editor";

export interface ICinematicEditorTimelineOptionsProps {
	cinematicEditor: CinematicEditor;
}

export function CinematicEditorTimelineOptions(props: ICinematicEditorTimelineOptionsProps) {
	function handleOutputFramesPerSecondChange(value: string) {
		props.cinematicEditor.cinematic.outputFramesPerSecond = parseFloat(value);
		props.cinematicEditor.forceUpdate();
	}

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="ghost" className="rounded-full px-2">
					<FaGear className="w-4 h-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-96" asChild>
				<div className="grid gap-4">
					<div className="space-y-2">
						<h4 className="font-medium leading-none">时间轴选项</h4>
						<p className="text-sm text-muted-foreground">Configure the options of the timeline.</p>
					</div>

					<div className="grid gap-2">
						<div className="grid grid-cols-2 items-center gap-4">
							<Label>每秒帧数</Label>

							<Select value={props.cinematicEditor.cinematic.outputFramesPerSecond?.toString()} onValueChange={(v) => handleOutputFramesPerSecondChange(v)}>
								<SelectTrigger className="">
									<SelectValue placeholder="默认（60 帧/秒）" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="24">24 帧/秒（经典电影）</SelectItem>
									<SelectItem value="29.97">29.97 帧/秒（NTSC）</SelectItem>
									<SelectItem value="30">30 帧/秒（NTSC）</SelectItem>
									<SelectItem value="50">50 帧/秒（PAL）</SelectItem>
									<SelectItem value="60">60 帧/秒（PAL）</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
