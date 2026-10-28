import { fakeAsync, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { IdlePreloadStrategy } from './idle-preload.strategy';

describe('IdlePreloadStrategy', () => {
  const strategy = new IdlePreloadStrategy();

  it('never downloads routes that are not marked for preloading', fakeAsync(() => {
    const load = jasmine.createSpy('load').and.returnValue(of('module'));
    strategy.preload({ path: 'tavern' }, load).subscribe();
    tick(10_000);
    expect(load).not.toHaveBeenCalled();
  }));

  it('downloads marked routes only after the first page had time to settle', fakeAsync(() => {
    const idle = spyOn(window as any, 'requestIdleCallback').and.callFake((cb: () => void) => { cb(); return 1; });
    const load = jasmine.createSpy('load').and.returnValue(of('module'));
    let result: unknown;
    strategy.preload({ path: 'catalog', data: { preload: true } }, load).subscribe(value => (result = value));
    tick(2_999);
    expect(load).not.toHaveBeenCalled();
    tick(1);
    expect(idle).toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
    expect(result).toBe('module');
  }));
});
