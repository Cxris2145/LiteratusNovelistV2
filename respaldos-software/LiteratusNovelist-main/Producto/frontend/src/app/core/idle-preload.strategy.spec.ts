import { fakeAsync, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { IdlePreloadStrategy } from './idle-preload.strategy';

describe('IdlePreloadStrategy', () => {
  const strategy = new IdlePreloadStrategy();
  const network = (connection: object | undefined) =>
    spyOnProperty(navigator as any, 'connection', 'get').and.returnValue(connection);

  it('never downloads routes that are not marked for preloading', fakeAsync(() => {
    const load = jasmine.createSpy('load').and.returnValue(of('module'));
    strategy.preload({ path: 'tavern' }, load).subscribe();
    tick(10_000);
    expect(load).not.toHaveBeenCalled();
  }));

  it('downloads marked routes only after the first page loaded and had time to settle', fakeAsync(() => {
    network({ effectiveType: '4g', downlink: 10 });
    const idle = spyOn(window as any, 'requestIdleCallback').and.callFake((cb: () => void) => { cb(); return 1; });
    const load = jasmine.createSpy('load').and.returnValue(of('module'));
    let result: unknown;
    strategy.preload({ path: 'catalog', data: { preload: true } }, load).subscribe(value => (result = value));
    tick(2_499);
    expect(load).not.toHaveBeenCalled();
    tick(1);
    expect(idle).toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
    expect(result).toBe('module');
  }));

  it('waits longer on 3G so the first page keeps the bandwidth', fakeAsync(() => {
    network({ effectiveType: '3g', downlink: 1.2 });
    spyOn(window as any, 'requestIdleCallback').and.callFake((cb: () => void) => { cb(); return 1; });
    const load = jasmine.createSpy('load').and.returnValue(of('module'));
    strategy.preload({ path: 'catalog', data: { preload: true } }, load).subscribe();
    tick(7_999);
    expect(load).not.toHaveBeenCalled();
    tick(1);
    expect(load).toHaveBeenCalledTimes(1);
  }));

  it('preloads nothing with data saver or 2G', fakeAsync(() => {
    const spy = network({ saveData: true, effectiveType: '4g' });
    const load = jasmine.createSpy('load').and.returnValue(of('module'));
    strategy.preload({ path: 'catalog', data: { preload: true } }, load).subscribe();
    spy.and.returnValue({ effectiveType: 'slow-2g' });
    strategy.preload({ path: 'authors', data: { preload: true } }, load).subscribe();
    tick(20_000);
    expect(load).not.toHaveBeenCalled();
  }));
});
