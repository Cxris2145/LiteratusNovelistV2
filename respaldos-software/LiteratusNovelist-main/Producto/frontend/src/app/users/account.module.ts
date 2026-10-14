import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../shared/shared.module';
import { ProfileComponent } from './profile/profile.component';
import { AchievementsComponent } from '../library/achievements/achievements.component';
import { FlashcardsComponent } from '../library/flashcards/flashcards.component';
import { FavoritesComponent } from '../library/favorites/favorites.component';
import { AuthorSubmitBookComponent } from '../catalog/author-submit-book/author-submit-book.component';

/** Perfil, logros, tarjetas de vocabulario, favoritos y publicar libro (todas piden sesión). */
@NgModule({
  declarations: [ProfileComponent, AchievementsComponent, FlashcardsComponent, FavoritesComponent, AuthorSubmitBookComponent],
  imports: [SharedModule],
  exports: [ProfileComponent, AchievementsComponent, FlashcardsComponent, FavoritesComponent, AuthorSubmitBookComponent],
})
export class AccountModule {}

@NgModule({ imports: [AccountModule, RouterModule.forChild([{ path: '', component: ProfileComponent }])] })
export class ProfileRouteModule {}

@NgModule({ imports: [AccountModule, RouterModule.forChild([{ path: '', component: AchievementsComponent }])] })
export class AchievementsRouteModule {}

@NgModule({ imports: [AccountModule, RouterModule.forChild([{ path: '', component: FlashcardsComponent }])] })
export class FlashcardsRouteModule {}

@NgModule({ imports: [AccountModule, RouterModule.forChild([{ path: '', component: FavoritesComponent }])] })
export class FavoritesRouteModule {}

@NgModule({ imports: [AccountModule, RouterModule.forChild([{ path: '', component: AuthorSubmitBookComponent }])] })
export class PublishBookRouteModule {}
