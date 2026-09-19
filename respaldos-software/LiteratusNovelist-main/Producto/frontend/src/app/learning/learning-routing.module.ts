import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LearningPathComponent } from './learning-path/learning-path.component';
import { PlayLevelComponent } from './play-level/play-level.component';

const routes: Routes = [
  { path: '', component: LearningPathComponent },
  { path: 'play/:id', component: PlayLevelComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class LearningRoutingModule { }
