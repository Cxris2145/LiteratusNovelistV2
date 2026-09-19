import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LearningRoutingModule } from './learning-routing.module';
import { LearningPathComponent } from './learning-path/learning-path.component';
import { PlayLevelComponent } from './play-level/play-level.component';

@NgModule({
  declarations: [
    LearningPathComponent,
    PlayLevelComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    LearningRoutingModule
  ]
})
export class LearningModule { }
