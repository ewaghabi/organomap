import { expect, test } from '@playwright/test';
import {
  byId,
  clickAddChild,
  dragNode,
  dragSubtreeWithShift,
  getModel,
  getViewState,
  gotoApp,
  importDiagram,
  resizeNodeBottomRight
} from './helpers.mjs';

async function setColorInput(page, selector, value) {
  await page.locator(selector).evaluate((el, newValue) => {
    el.value = newValue;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function setRangeInput(page, selector, value) {
  await page.locator(selector).evaluate((el, newValue) => {
    el.value = String(newValue);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test.describe('Organomap - regression suite', () => {
  test('initializes with one root node and no connections', async ({ page }) => {
    await gotoApp(page);

    const model = await getModel(page);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0].parentId).toBeNull();
    await expect(page.locator('#connections-layer path')).toHaveCount(0);
  });

  test('adds children with correct hierarchy and rightward placement for siblings', async ({ page }) => {
    await gotoApp(page);
    const rootId = (await getModel(page)).nodes[0].id;

    await clickAddChild(page, rootId);
    await clickAddChild(page, rootId);

    const model = await getModel(page);
    expect(model.nodes).toHaveLength(3);

    const root = model.nodes.find((n) => !n.parentId);
    const children = model.nodes.filter((n) => n.parentId === root.id).sort((a, b) => a.x - b.x);
    expect(children).toHaveLength(2);
    expect(children[0].y).toBeGreaterThan(root.y);
    expect(children[1].x).toBeGreaterThan(children[0].x);
    await expect(page.locator('#connections-layer path')).toHaveCount(2);
  });

  test('supports title and content edits without breaking node rendering', async ({ page }) => {
    await gotoApp(page);
    const rootId = (await getModel(page)).nodes[0].id;

    const title = page.locator(`#${rootId} .node-title`);
    await title.dblclick();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('Diretoria Geral');
    await page.locator('#canvas-container').click({ position: { x: 120, y: 120 } });

    const content = page.locator(`#${rootId} .node-content`);
    await content.dblclick();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('Linha 1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Linha 2');
    await page.locator('#canvas-container').click({ position: { x: 130, y: 130 } });

    await expect(title).toHaveText('Diretoria Geral');
    await expect(content).toContainText('Linha 1');
    await expect(content).toContainText('Linha 2');
  });

  test('drags a single node without moving the parent', async ({ page }) => {
    await gotoApp(page);
    const rootId = (await getModel(page)).nodes[0].id;

    await clickAddChild(page, rootId);
    const modelBefore = await getModel(page);
    const root = modelBefore.nodes.find((n) => !n.parentId);
    const child = modelBefore.nodes.find((n) => n.parentId === root.id);

    await dragNode(page, child.id, 140, 90);

    const modelAfter = await getModel(page);
    const afterRoot = modelAfter.nodes.find((n) => n.id === root.id);
    const afterChild = modelAfter.nodes.find((n) => n.id === child.id);

    expect(afterChild.x).toBeGreaterThan(child.x);
    expect(afterChild.y).toBeGreaterThan(child.y);
    expect(afterRoot.x).toBe(root.x);
    expect(afterRoot.y).toBe(root.y);
  });

  test('shift-drag moves the full subtree while preserving relative offsets', async ({ page }) => {
    await gotoApp(page);
    const rootId = (await getModel(page)).nodes[0].id;
    await clickAddChild(page, rootId);

    const afterFirstChild = await getModel(page);
    const childId = afterFirstChild.nodes.find((n) => n.parentId === rootId).id;
    await clickAddChild(page, childId);

    const before = byId((await getModel(page)).nodes);
    const grandchildId = Object.values(before).find((n) => n.parentId === childId).id;

    await dragSubtreeWithShift(page, childId, 120, 70);

    const after = byId((await getModel(page)).nodes);
    expect(after[rootId].x).toBe(before[rootId].x);
    expect(after[rootId].y).toBe(before[rootId].y);
    expect(after[childId].x - before[childId].x).toBeCloseTo(120, 1);
    expect(after[childId].y - before[childId].y).toBeCloseTo(70, 1);
    expect(after[grandchildId].x - before[grandchildId].x).toBeCloseTo(120, 1);
    expect(after[grandchildId].y - before[grandchildId].y).toBeCloseTo(70, 1);
  });

  test('resizes nodes and enforces minimum dimensions', async ({ page }) => {
    await gotoApp(page);
    const rootId = (await getModel(page)).nodes[0].id;

    await resizeNodeBottomRight(page, rootId, -800, -600);
    const afterShrink = byId((await getModel(page)).nodes);
    expect(afterShrink[rootId].width).toBeGreaterThanOrEqual(100);
    expect(afterShrink[rootId].height).toBeGreaterThanOrEqual(50);

    await resizeNodeBottomRight(page, rootId, 140, 90);
    const afterGrow = byId((await getModel(page)).nodes);
    expect(afterGrow[rootId].width).toBeGreaterThan(afterShrink[rootId].width);
    expect(afterGrow[rootId].height).toBeGreaterThan(afterShrink[rootId].height);
  });

  test('deletes a node with cascading removal of descendants only', async ({ page }) => {
    await gotoApp(page);
    const rootId = (await getModel(page)).nodes[0].id;
    await clickAddChild(page, rootId);
    await clickAddChild(page, rootId);

    const withSiblings = await getModel(page);
    const children = withSiblings.nodes.filter((n) => n.parentId === rootId);
    const targetChildId = children[0].id;
    const siblingId = children[1].id;
    await clickAddChild(page, targetChildId);

    await page.locator(`#${targetChildId}`).click();
    await page.locator('#delete-btn').click();
    await expect(page.locator('#confirm-modal')).toHaveClass(/active/);
    await page.locator('#btn-confirm-yes').click();

    const afterDelete = byId((await getModel(page)).nodes);
    expect(afterDelete[targetChildId]).toBeUndefined();
    expect(afterDelete[siblingId]).toBeDefined();
    expect(Object.values(afterDelete).some((n) => n.parentId === targetChildId)).toBe(false);
  });

  test('applies format painter in single mode and exits automatically', async ({ page }) => {
    await gotoApp(page);
    const rootId = (await getModel(page)).nodes[0].id;
    await clickAddChild(page, rootId);
    const childId = (await getModel(page)).nodes.find((n) => n.parentId === rootId).id;

    await page.locator(`#${rootId}`).click();
    await setColorInput(page, '#bg-color-picker', '#ffcccc');
    await setColorInput(page, '#border-color-picker', '#0088cc');
    await setColorInput(page, '#text-color-picker', '#2222aa');
    await setRangeInput(page, '#border-width-slider', 5);
    await setRangeInput(page, '#font-size-slider', 24);

    await page.locator('#format-painter-btn').click();
    await page.waitForTimeout(300);
    await page.locator(`#${childId}`).click();

    const model = byId((await getModel(page)).nodes);
    expect(model[childId].style).toEqual(model[rootId].style);
    await expect(page.locator('body')).not.toHaveClass(/format-painter-mode/);
  });

  test('applies format painter in continuous mode until background click', async ({ page }) => {
    await gotoApp(page);
    const rootId = (await getModel(page)).nodes[0].id;
    await clickAddChild(page, rootId);
    await clickAddChild(page, rootId);
    const children = (await getModel(page)).nodes.filter((n) => n.parentId === rootId).map((n) => n.id);

    await page.locator(`#${rootId}`).click();
    await setColorInput(page, '#bg-color-picker', '#e6ffe6');
    await setColorInput(page, '#border-color-picker', '#228822');
    await page.locator('#format-painter-btn').dblclick();

    await page.locator(`#${children[0]}`).click();
    await page.locator(`#${children[1]}`).click();

    const afterApply = byId((await getModel(page)).nodes);
    expect(afterApply[children[0]].style).toEqual(afterApply[rootId].style);
    expect(afterApply[children[1]].style).toEqual(afterApply[rootId].style);
    await expect(page.locator('body')).toHaveClass(/format-painter-mode/);

    // Click below the fixed header to hit the actual canvas background.
    await page.locator('#canvas-container').click({ position: { x: 120, y: 140 } });
    await expect(page.locator('body')).not.toHaveClass(/format-painter-mode/);
  });

  test('validates import input and applies imported title and nodes', async ({ page }) => {
    await gotoApp(page);

    await page.locator('#import-btn').click();
    await page.locator('#import-textarea').fill('{"broken":');
    await expect(page.locator('#btn-confirm-import')).toBeDisabled();
    await page.locator('#import-modal .btn.btn-cancel').click();

    await importDiagram(page, {
      title: 'Mapa Importado',
      nodes: [
        {
          id: 'node-root',
          x: 10,
          y: 20,
          width: 180,
          height: 100,
          title: 'Root',
          text: 'Texto root',
          parentId: null,
          style: {
            backgroundColor: '#ffffff',
            borderColor: '#cccccc',
            borderWidth: 2,
            fontSize: 16,
            color: '#000000'
          }
        },
        {
          id: 'node-child',
          x: 60,
          y: 220,
          width: 180,
          height: 100,
          title: 'Child',
          text: 'Texto child',
          parentId: 'node-root',
          style: {
            backgroundColor: '#ffeeee',
            borderColor: '#aa4444',
            borderWidth: 3,
            fontSize: 18,
            color: '#111111'
          }
        }
      ]
    });

    await expect(page.locator('#project-title')).toHaveText('Mapa Importado');
    await expect(page.locator('#nodes-layer .node')).toHaveCount(2);
    await expect(page.locator('#connections-layer path')).toHaveCount(1);
  });

  test('exports to clipboard and shows success feedback', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => {
      window.__copied = null;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.__copied = text;
          }
        }
      });
    });

    await page.locator('#export-btn').click();
    await expect(page.locator('#alert-modal')).toHaveClass(/active/);
    await expect(page.locator('#alert-message')).toContainText('área de transferência');

    const copied = await page.evaluate(() => window.__copied);
    const parsed = JSON.parse(copied);
    expect(parsed).toHaveProperty('title');
    expect(Array.isArray(parsed.nodes)).toBe(true);
    expect(parsed.nodes.length).toBeGreaterThan(0);
  });

  test('updates view transform for zoom, pan and reset actions', async ({ page }) => {
    await gotoApp(page);
    const initial = await getViewState(page);

    await page.locator('#zoom-controls .zoom-btn').first().click();
    const afterZoomIn = await getViewState(page);
    expect(afterZoomIn.scale).toBeGreaterThan(initial.scale);

    const canvasBox = await page.locator('#canvas-container').boundingBox();
    const startX = canvasBox.x + canvasBox.width * 0.7;
    const startY = canvasBox.y + canvasBox.height * 0.7;
    await page.mouse.move(startX, startY);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(startX + 80, startY + 60);
    await page.mouse.up({ button: 'left' });
    const afterPan = await getViewState(page);
    expect(afterPan.x).not.toBe(afterZoomIn.x);
    expect(afterPan.y).not.toBe(afterZoomIn.y);

    await page.locator('#reset-view-btn').click();
    const afterResetView = await getViewState(page);
    expect(afterResetView.scale).toBe(1);
    expect(afterResetView.x).not.toBe(afterPan.x);
    expect(afterResetView.y).not.toBe(afterPan.y);
  });
});
