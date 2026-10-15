import {
  columnsForViewport,
  countChapterPages,
  countSpreads,
  fitLinesToPage,
  pageOfElement,
  pageStride,
  spreadOfElement,
  spreadStride,
  swipePageDelta
} from './reader-pager';

describe('reader pager', () => {
  it('uses two pages only on wide landscape viewports, including both boundaries', () => {
    expect(columnsForViewport(375, 812)).toBe(1);
    expect(columnsForViewport(844, 390)).toBe(1);
    expect(columnsForViewport(999, 600)).toBe(1);
    expect(columnsForViewport(1000, 801)).toBe(1);
    expect(columnsForViewport(1000, 800)).toBe(2);
    expect(columnsForViewport(1440, 900)).toBe(2);
    expect(columnsForViewport(1440, 0)).toBe(1);
  });

  it('includes the trailing column gap in the spread and page strides', () => {
    expect(spreadStride(1000, 40)).toBe(1040);
    expect(pageStride(1000, 40, 2)).toBe(520);
    expect(pageStride(375, 24, 1)).toBe(399);
    expect(spreadStride(0, -4)).toBe(1);
    expect(pageStride(0, 0, 0)).toBe(1);
  });

  it('finds pages and spreads after translateX, including the right-hand page', () => {
    // El segundo pliego se trasladó 1040px a la izquierda. Su página derecha es la 3.
    const rect = { left: 650, right: 670 };
    expect(pageOfElement(rect, 100, 1040, 1000, 40, 2)).toBe(3);
    expect(spreadOfElement(rect, 100, 1040, 1000, 40, 2)).toBe(1);
    expect(pageOfElement({ left: 130, right: 150 }, 100, 1040, 1000, 40, 2)).toBe(2);
  });

  it('restores content coordinates while a finger drag changes the transform', () => {
    // Arrastrar 160px a la derecha cambia translateX(-1040px) a translateX(-880px).
    const rect = { left: 810, right: 830 };
    expect(pageOfElement(rect, 100, 880, 1000, 40, 2)).toBe(3);
    expect(spreadOfElement(rect, 100, 880, 1000, 40, 2)).toBe(1);
  });

  it('handles single-page viewports, exact boundaries and leading offscreen content', () => {
    expect(pageOfElement({ left: 30, right: 50 }, 20, 798, 375, 24, 1)).toBe(2);
    expect(pageOfElement({ left: 520, right: 520 }, 0, 0, 1000, 40, 2)).toBe(1);
    expect(spreadOfElement({ left: -300, right: -280 }, 0, 0, 1000, 40, 2)).toBe(0);
  });

  it('counts columns rather than rounding the final spread up to a full pair', () => {
    expect(countChapterPages(1520, 1000, 40, 2)).toBe(3);
    expect(countSpreads(3, 2)).toBe(2);
    expect(countChapterPages(2040, 1000, 40, 2)).toBe(4);
    expect(countSpreads(4, 2)).toBe(2);
    expect(countChapterPages(1173, 375, 24, 1)).toBe(3);
  });

  it('uses the last content edge when scrollWidth includes an unused visible page', () => {
    expect(countChapterPages(1000, 1000, 40, 2, 300)).toBe(1);
    expect(countChapterPages(1000, 1000, 40, 2, 900)).toBe(2);
    expect(countChapterPages(2040, 1000, 40, 2, 1450)).toBe(3);
    expect(countChapterPages(1000, 1000, 40, 2, 0)).toBe(1);
  });

  it('avoids phantom pages from subpixel rounding and always has a first page', () => {
    expect(countChapterPages(1520.25, 1000, 40, 2)).toBe(3);
    expect(countChapterPages(0, 1000, 40, 2)).toBe(1);
    expect(countChapterPages(Number.NaN, 0, 0, 0)).toBe(1);
    expect(countSpreads(0, 2)).toBe(1);
  });

  it('fits complete lines after removing vertical padding', () => {
    expect(fitLinesToPage(655, 20, 1.6, 32)).toBe(19);
    expect(fitLinesToPage(672, 20, 1.6, 32)).toBe(20);
    expect(fitLinesToPage(60, 20, 1.6, 32, 6)).toBe(6);
    expect(fitLinesToPage(0, 0, 0)).toBe(1);
  });

  it('completes swipes beyond 30 percent of the width in either direction', () => {
    expect(swipePageDelta(-121, 1000, 400)).toBe(1);
    expect(swipePageDelta(121, 1000, 400)).toBe(-1);
    expect(swipePageDelta(-120, 1000, 400)).toBe(0);
  });

  it('completes fast short swipes beyond 0.5px/ms, keeping the strict threshold', () => {
    expect(swipePageDelta(-31, 60, 400)).toBe(1);
    expect(swipePageDelta(31, 60, 400)).toBe(-1);
    expect(swipePageDelta(-30, 60, 400)).toBe(0);
    expect(swipePageDelta(-1, 0, 400)).toBe(0);
    expect(swipePageDelta(-121, 0, 400)).toBe(1);
    expect(swipePageDelta(-121, 60, 0)).toBe(0);
  });
});
