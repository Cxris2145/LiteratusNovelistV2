import { DOCUMENT } from '@angular/common';
import { ConfigurableFocusTrap, ConfigurableFocusTrapFactory } from '@angular/cdk/a11y';
import {
  AfterViewInit, Directive, ElementRef, EventEmitter, HostListener, Injectable, Input,
  NgZone, OnChanges, OnDestroy, Output, inject,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Subscription } from 'rxjs';

export const TAVERN_MOBILE_QUERY = '(max-width: 700px), (max-height: 500px) and (pointer: coarse)';

export function isTavernMobilePanel(): boolean {
  return typeof matchMedia === 'function' && matchMedia(TAVERN_MOBILE_QUERY).matches;
}

/** One background lock for all of the tavern's mobile panels, including a panel switch. */
@Injectable({ providedIn: 'root' })
class TavernMobilePanelState {
  private document = inject(DOCUMENT);
  private panels: HTMLElement[] = [];
  private inert = new Map<HTMLElement, string | null>();
  private savedBody: { overflow: string; position: string; top: string; left: string; width: string } | null = null;
  private rootOverflow = '';
  private scrollX = 0;
  private scrollY = 0;

  get top(): HTMLElement | undefined { return this.panels[this.panels.length - 1]; }

  activate(panel: HTMLElement): void {
    if (this.panels.includes(panel)) return;
    if (!this.panels.length) this.lockScroll();
    this.panels.push(panel);
    this.updateInert();
  }

  deactivate(panel: HTMLElement): void {
    this.panels = this.panels.filter(item => item !== panel);
    this.updateInert();
    if (!this.panels.length) this.unlockScroll();
  }

  private updateInert(): void {
    for (const [element, value] of this.inert) {
      if (value === null) element.removeAttribute('inert');
      else element.setAttribute('inert', value);
    }
    this.inert.clear();
    let branch = this.top;
    while (branch && branch !== this.document.body) {
      const parent = branch.parentElement;
      if (!parent) break;
      for (const sibling of Array.from(parent.children)) {
        // Material dialogs live outside the app. They must remain interactive over the panel.
        if (sibling === branch || !(sibling instanceof HTMLElement)
            || sibling.matches('.cdk-overlay-container, .cdk-focus-trap-anchor')
            || sibling.querySelector('.cdk-overlay-container')) continue;
        this.inert.set(sibling, sibling.getAttribute('inert'));
        sibling.setAttribute('inert', '');
      }
      branch = parent;
    }
  }

  private lockScroll(): void {
    const body = this.document.body;
    const win = this.document.defaultView;
    this.scrollX = win?.scrollX || 0;
    this.scrollY = win?.scrollY || 0;
    this.savedBody = {
      overflow: body.style.overflow, position: body.style.position, top: body.style.top,
      left: body.style.left, width: body.style.width,
    };
    this.rootOverflow = this.document.documentElement.style.overflow;
    this.document.documentElement.style.overflow = 'hidden';
    Object.assign(body.style, { overflow: 'hidden', position: 'fixed', top: `-${this.scrollY}px`, left: '0', width: '100%' });
  }

  private unlockScroll(): void {
    if (!this.savedBody) return;
    Object.assign(this.document.body.style, this.savedBody);
    this.document.documentElement.style.overflow = this.rootOverflow;
    this.savedBody = null;
    this.document.defaultView?.scrollTo(this.scrollX, this.scrollY);
  }
}

/** Desktop drawers become accessible, keyboard-aware dialogs only on a phone. */
@Directive({ selector: '[appTavernMobilePanel]', standalone: true })
export class TavernMobilePanelDirective implements AfterViewInit, OnChanges, OnDestroy {
  private element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private document = inject(DOCUMENT);
  private zone = inject(NgZone);
  private traps = inject(ConfigurableFocusTrapFactory);
  private state = inject(TavernMobilePanelState);
  private dialogs = inject(MatDialog, { optional: true });
  private media = this.document.defaultView?.matchMedia(TAVERN_MOBILE_QUERY);
  private subscriptions = new Subscription();
  private ready = false;
  private active = false;
  private trap?: ConfigurableFocusTrap;
  private returnFocus: HTMLElement | null = null;
  private savedAttributes = new Map<string, string | null>();
  private focusTimer?: ReturnType<typeof setTimeout>;
  private contentObserver?: MutationObserver;

  @Input('appTavernMobilePanel') open = false;
  @Output() mobilePanelClose = new EventEmitter<void>();

  private onMediaChange = () => this.zone.run(() => this.sync());

  constructor() {
    this.element.classList.add('tavern-mobile-panel');
    this.media?.addEventListener('change', this.onMediaChange);
    if (this.dialogs) {
      // Angular Material 17 uses a regular FocusTrap, so explicitly suspend the parent trap.
      this.subscriptions.add(this.dialogs.afterOpened.subscribe(() => this.syncDialogTrap()));
      this.subscriptions.add(this.dialogs.afterAllClosed.subscribe(() => this.syncDialogTrap()));
    }
  }

  ngAfterViewInit(): void { this.ready = true; this.sync(); }
  ngOnChanges(): void { this.sync(); }

  ngOnDestroy(): void {
    this.media?.removeEventListener('change', this.onMediaChange);
    this.subscriptions.unsubscribe();
    this.deactivate();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.active || this.state.top !== this.element || event.key !== 'Escape'
        || event.defaultPrevented || this.dialogs?.openDialogs.length) return;
    event.preventDefault();
    event.stopPropagation();
    this.mobilePanelClose.emit();
  }

  private sync(): void {
    if (!this.ready) return;
    if (this.open && this.media?.matches) this.activate();
    else this.deactivate();
  }

  private activate(): void {
    if (this.active) return;
    this.active = true;
    const focused = this.document.activeElement;
    this.returnFocus = focused instanceof HTMLElement && !this.element.contains(focused) ? focused : null;
    for (const name of ['role', 'aria-modal', 'tabindex']) this.savedAttributes.set(name, this.element.getAttribute(name));
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    if (!this.element.hasAttribute('tabindex')) this.element.tabIndex = -1;
    this.state.activate(this.element);
    this.trap = this.traps.create(this.element);
    this.syncDialogTrap();
    this.scheduleHeadingFocus();
    // Moving from a list into a conversation replaces its heading. Keep focus in that view,
    // without opening the virtual keyboard or disturbing a field the user already selected.
    this.contentObserver = new MutationObserver(() => {
      if (!this.element.contains(this.document.activeElement)) this.scheduleHeadingFocus();
    });
    this.contentObserver.observe(this.element, { childList: true, subtree: true });
  }

  private deactivate(): void {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.focusTimer);
    this.contentObserver?.disconnect();
    this.contentObserver = undefined;
    this.trap?.destroy();
    this.trap = undefined;
    for (const [name, value] of this.savedAttributes) {
      if (value === null) this.element.removeAttribute(name);
      else this.element.setAttribute(name, value);
    }
    this.savedAttributes.clear();
    this.state.deactivate(this.element);
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected && !target.closest('[inert]') && !this.dialogs?.openDialogs.length
        && (!this.state.top || this.state.top.contains(target))) target.focus({ preventScroll: true });
  }

  private syncDialogTrap(): void {
    if (this.trap) this.trap.enabled = !this.dialogs?.openDialogs.length;
  }

  private scheduleHeadingFocus(): void {
    clearTimeout(this.focusTimer);
    this.focusTimer = setTimeout(() => {
      if (!this.active || this.state.top !== this.element || this.dialogs?.openDialogs.length) return;
      const labelId = this.element.getAttribute('aria-labelledby')?.split(/\s+/)[0];
      const labelled = labelId ? this.document.getElementById(labelId) : null;
      const heading = (labelled && this.element.contains(labelled) ? labelled : null)
        || this.element.querySelector<HTMLElement>('[data-mobile-panel-heading], h2, h1');
      const target = heading || this.element;
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    });
  }
}
