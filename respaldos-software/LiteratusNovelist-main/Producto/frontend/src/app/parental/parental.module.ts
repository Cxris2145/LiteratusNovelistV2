import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../shared/shared.module';
import { ParentalHomeComponent } from './parental-home/parental-home.component';
import { ChildHistoryComponent } from './child-history/child-history.component';
import { ChildFormDialogComponent } from './child-form-dialog/child-form-dialog.component';
import { GuardianActionDialogComponent } from './guardian-action-dialog/guardian-action-dialog.component';

/** Control parental (/control-parental): inicio del tutor e historial de cada hijo. */
@NgModule({
  declarations: [ParentalHomeComponent, ChildHistoryComponent, ChildFormDialogComponent, GuardianActionDialogComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: ParentalHomeComponent },
      { path: ':childId', component: ChildHistoryComponent },
    ]),
  ],
})
export class ParentalModule {}
