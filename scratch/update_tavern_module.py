path = r'respaldos-software\LiteratusNovelist-main\Producto\frontend\src\app\community\tavern.module.ts'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

target = """import { TavernTableComponent } from './tavern-table/tavern-table.component';

/** La Taberna (comunidad, El Bazar, mesa) se descarga al entrar a /tavern. */
@NgModule({
  declarations: [
    TavernHallComponent, TavernSceneComponent, TavernBazarComponent,
    ProfileCardComponent, FriendListComponent, AddFriendDialogComponent, FriendProfileComponent,
    FriendChatComponent, TavernReadingClubsComponent, TavernCrowdComponent,
  ],
  imports: [
    SharedModule, TavernTableComponent,
    RouterModule.forChild([
      { path: '', component: TavernHallComponent },
      { path: 'amigo/:code', component: FriendProfileComponent, canActivate: [authGuard] },
    ]),
  ],
})"""

replacement = """import { TavernTableComponent } from './tavern-table/tavern-table.component';
import { MaguitoCustomizerComponent } from './maguito-customizer/maguito-customizer.component';

/** La Taberna (comunidad, El Bazar, mesa) se descarga al entrar a /tavern. */
@NgModule({
  declarations: [
    TavernHallComponent, TavernSceneComponent, TavernBazarComponent,
    ProfileCardComponent, FriendListComponent, AddFriendDialogComponent, FriendProfileComponent,
    FriendChatComponent, TavernReadingClubsComponent, TavernCrowdComponent,
  ],
  imports: [
    SharedModule, TavernTableComponent, MaguitoCustomizerComponent,
    RouterModule.forChild([
      { path: '', component: TavernHallComponent },
      { path: 'personalizar', component: MaguitoCustomizerComponent },
      { path: 'amigo/:code', component: FriendProfileComponent, canActivate: [authGuard] },
    ]),
  ],
  exports: [MaguitoCustomizerComponent],
})"""

target_crlf = target.replace('\n', '\r\n')
replacement_crlf = replacement.replace('\n', '\r\n')

if target_crlf in text:
    text = text.replace(target_crlf, replacement_crlf)
    print("Replaced CRLF")
elif target in text:
    text = text.replace(target, replacement)
    print("Replaced LF")
else:
    print("Target not found")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
print("tavern.module.ts updated!")

