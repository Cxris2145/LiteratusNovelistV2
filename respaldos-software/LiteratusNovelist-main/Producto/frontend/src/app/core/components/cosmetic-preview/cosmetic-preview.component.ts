import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MaguitoOutfit, parseWear } from '../maguito/maguito-outfit';

@Component({
  selector: 'app-cosmetic-preview',
  template: `
    <app-avatar-frame *ngIf="item?.item_type === 'profile_frame'" [frame]="item?.value" size="md">
      <span class="cp-avatar" [style.background]="avatarColor">
        <img *ngIf="avatar" [src]="avatar" alt="" (error)="avatar = null">
        <span *ngIf="!avatar">{{ initial }}</span>
      </span>
    </app-avatar-frame>
    <span *ngIf="item?.item_type === 'title'" class="cp-title">{{ item?.value }}</span>
    <app-maguito *ngIf="item?.item_type === 'maguito_wear'" [outfit]="look" [paused]="true"
      [interactive]="false" [followPointer]="false" [label]="item?.name || ''"></app-maguito>
  `,
  styles: [`
    :host { display: flex; align-items: center; justify-content: center; min-height: 76px; }
    .cp-avatar { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; overflow: hidden; color: white; font-size: 1.3rem; }
    img { width: 100%; height: 100%; object-fit: cover; }
    .cp-title { border-block: 1px solid var(--color-border); padding: 8px 12px; font-family: var(--font-display, Georgia, serif); color: var(--color-warning); text-align: center; overflow-wrap: anywhere; }
    app-maguito { width: 82px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CosmeticPreviewComponent {
  @Input() item: { item_type: string; value: string; name: string } | null = null;
  @Input() avatar: string | null = null;
  @Input() avatarColor = '#655099';
  @Input() initial = 'L';
  @Input() outfit: MaguitoOutfit | null = null;
  get look(): MaguitoOutfit {
    const wear = parseWear(this.item?.value);
    return wear ? { ...this.outfit, [wear.slot]: wear.variant } : this.outfit || {};
  }
}
