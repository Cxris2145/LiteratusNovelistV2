import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../shared/shared.module';
import { CharacterHubComponent } from './character-hub/character-hub.component';
import { DemoChatPageComponent } from './demo-chat-page/demo-chat-page.component';
import { MessagesComponent } from './messages/messages.component';

/** Personajes, el chat con cada uno y Mensajes: un solo archivo que se descarga al abrir cualquiera. */
@NgModule({
  declarations: [CharacterHubComponent, DemoChatPageComponent, MessagesComponent],
  imports: [SharedModule],
  exports: [CharacterHubComponent, DemoChatPageComponent, MessagesComponent],
})
export class CharactersModule {}

// Una ruta de primer nivel por página (/characters, /demo-chat, /messages), todas del mismo archivo.
@NgModule({ imports: [CharactersModule, RouterModule.forChild([{ path: '', component: CharacterHubComponent }])] })
export class CharacterHubRouteModule {}

@NgModule({
  imports: [CharactersModule, RouterModule.forChild([
    { path: '', component: DemoChatPageComponent },
    { path: ':avatarId', component: DemoChatPageComponent },
  ])],
})
export class DemoChatRouteModule {}

@NgModule({ imports: [CharactersModule, RouterModule.forChild([{ path: '', component: MessagesComponent }])] })
export class MessagesRouteModule {}
