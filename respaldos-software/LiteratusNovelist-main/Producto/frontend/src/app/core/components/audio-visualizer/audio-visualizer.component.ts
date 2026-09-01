import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-audio-visualizer',
  templateUrl: './audio-visualizer.component.html',
  styleUrls: ['./audio-visualizer.component.css']
})
export class AudioVisualizerComponent {
  @Input() level: number = 0;
  @Input() isActive: boolean = false;
}
