import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../shared/shared.module';
import { authGuard } from '../core/guards/auth.guard';
import { TavernHallComponent } from './tavern-hall/tavern-hall.component';
import { TavernSceneComponent } from './tavern-scene/tavern-scene.component';
import { TavernBazarComponent } from './tavern-bazar/tavern-bazar.component';
import { ProfileCardComponent } from './profile-card/profile-card.component';
import { FriendListComponent } from './friend-list/friend-list.component';
import { AddFriendDialogComponent } from './add-friend-dialog/add-friend-dialog.component';
import { FriendProfileComponent } from './friend-profile/friend-profile.component';
import { FriendChatComponent } from './friend-chat/friend-chat.component';
import { TavernReadingClubsComponent } from './tavern-reading-clubs/tavern-reading-clubs.component';
import { TavernCrowdComponent } from './tavern-crowd/tavern-crowd.component';
import { TavernMusicComponent } from './tavern-music/tavern-music.component';
import { TavernTableComponent } from './tavern-table/tavern-table.component';

/** La Taberna (comunidad, El Bazar, mesa) se descarga al entrar a /tavern. */
@NgModule({
  declarations: [
    TavernHallComponent, TavernSceneComponent, TavernBazarComponent,
    ProfileCardComponent, FriendListComponent, AddFriendDialogComponent, FriendProfileComponent,
    FriendChatComponent, TavernReadingClubsComponent, TavernCrowdComponent,
  ],
  imports: [
    SharedModule, TavernMusicComponent, TavernTableComponent,
    RouterModule.forChild([
      { path: '', component: TavernHallComponent },
      { path: 'amigo/:code', component: FriendProfileComponent, canActivate: [authGuard] },
    ]),
  ],
})
export class TavernModule {}

