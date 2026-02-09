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
  test('uses save dialog mode and disk icon when showSaveFilePicker is available', async ({ page }) => {
    await page.addInitScript(() => {
      window.showSaveFilePicker = async () => ({
        createWritable: async () => ({ write: async () => { }, close: async () => { } })
      });
    });
    await gotoApp(page);

    await expect(page.locator('#export-btn')).toHaveAttribute('data-save-method', 'dialog');
    await expect(page.locator('#export-btn')).toHaveAttribute('data-tooltip', /Salvar JSON/);
    await expect(page.locator('#export-icon svg')).toBeVisible();
  });

  test('uses download mode and download icon when showSaveFilePicker is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: undefined
      });
    });
    await gotoApp(page);

    await expect(page.locator('#export-btn')).toHaveAttribute('data-save-method', 'download');
    await expect(page.locator('#export-btn')).toHaveAttribute('data-tooltip', /Baixar JSON/);
    await expect(page.locator('#export-icon svg')).toBeVisible();
  });

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

  test('toggles header visibility per selected node and preserves title content', async ({ page }) => {
    await gotoApp(page);
    const rootId = (await getModel(page)).nodes[0].id;

    await expect(page.locator('#header-toggle')).toBeEnabled();
    await expect(page.locator('#header-toggle')).toBeChecked();

    const title = page.locator(`#${rootId} .node-title`);
    await title.dblclick();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('Titulo Persistente');
    await page.locator(`#${rootId} .node-content`).click();

    await page.locator('#header-toggle-btn').click();
    await expect(page.locator('#header-toggle')).not.toBeChecked();
    await expect(page.locator(`#${rootId}`)).toHaveClass(/no-header/);
    expect((await getModel(page)).nodes[0].showHeader).toBe(false);

    await page.locator('#header-toggle-btn').click();
    await expect(page.locator('#header-toggle')).toBeChecked();
    await expect(page.locator(`#${rootId}`)).not.toHaveClass(/no-header/);
    await expect(page.locator(`#${rootId} .node-title`)).toHaveText('Titulo Persistente');
    expect((await getModel(page)).nodes[0].showHeader).toBe(true);

    const canvasBox = await page.locator('#canvas-container').boundingBox();
    await page.mouse.click(canvasBox.x + 120, canvasBox.y + 140, { button: 'right' });
    await expect(page.locator('#header-toggle')).toBeDisabled();
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

  test('right-drag on node pans canvas and does not move node/subtree', async ({ page }) => {
    await gotoApp(page);
    const rootId = (await getModel(page)).nodes[0].id;
    await clickAddChild(page, rootId);
    const childId = (await getModel(page)).nodes.find((n) => n.parentId === rootId).id;
    await clickAddChild(page, childId);

    const beforeModel = byId((await getModel(page)).nodes);
    const beforeView = await getViewState(page);

    const box = await page.locator(`#${childId}`).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 70);
    await page.mouse.up({ button: 'right' });

    const afterModel = byId((await getModel(page)).nodes);
    const afterView = await getViewState(page);

    expect(afterView.x).not.toBe(beforeView.x);
    expect(afterView.y).not.toBe(beforeView.y);
    expect(afterModel[rootId].x).toBe(beforeModel[rootId].x);
    expect(afterModel[rootId].y).toBe(beforeModel[rootId].y);
    expect(afterModel[childId].x).toBe(beforeModel[childId].x);
    expect(afterModel[childId].y).toBe(beforeModel[childId].y);
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
    await resizeNodeBottomRight(page, rootId, 120, 80);

    await page.locator('#format-painter-btn').click();
    await page.waitForTimeout(300);
    await page.locator(`#${childId}`).click();

    const model = byId((await getModel(page)).nodes);
    expect(model[childId].style).toEqual(model[rootId].style);
    expect(model[childId].width).toBe(model[rootId].width);
    expect(model[childId].height).toBe(model[rootId].height);
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
    const canvasBox = await page.locator('#canvas-container').boundingBox();
    await page.mouse.click(canvasBox.x + 120, canvasBox.y + 140, { button: 'right' });
    await expect(page.locator('body')).not.toHaveClass(/format-painter-mode/);
  });

  test('toggles off format painter when clicking the button again in continuous mode', async ({ page }) => {
    await gotoApp(page);
    const rootId = (await getModel(page)).nodes[0].id;
    await page.locator(`#${rootId}`).click();
    await page.locator('#format-painter-btn').dblclick();
    await expect(page.locator('body')).toHaveClass(/format-painter-mode/);

    await page.locator('#format-painter-btn').click();
    await expect(page.locator('body')).not.toHaveClass(/format-painter-mode/);
  });

  test('validates import input and applies imported title and nodes', async ({ page }) => {
    await gotoApp(page);

    await page.locator('#import-file-input').setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"broken":')
    });
    await expect(page.locator('#import-modal')).toHaveClass(/active/);
    await expect(page.locator('#import-modal-message')).toContainText('Formato JSON não reconhecido');
    await page.locator('#import-modal .btn.btn-primary').click();
    await expect(page.locator('#import-modal')).not.toHaveClass(/active/);

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
          showHeader: true,
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
          showHeader: false,
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
    await expect(page.locator('#node-child')).toHaveClass(/no-header/);

    await page.locator('#node-child').click();
    await expect(page.locator('#header-toggle')).toBeEnabled();
    await expect(page.locator('#header-toggle')).not.toBeChecked();
  });

  test('exports to json file using save dialog mode', async ({ page }) => {
    await page.addInitScript(() => {
      window.__saved = { method: null, filename: null, text: null };
      window.showSaveFilePicker = async ({ suggestedName }) => ({
        createWritable: async () => ({
          write: async (text) => {
            window.__saved = { method: 'dialog', filename: suggestedName, text };
          },
          close: async () => { }
        })
      });
    });

    await gotoApp(page);
    await page.locator('#header-toggle-btn').click();
    expect((await getModel(page)).nodes[0].showHeader).toBe(false);

    await page.locator('#project-title').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('Meu Mapa');
    await page.locator('#canvas-container').click({ position: { x: 120, y: 140 } });

    await page.locator('#export-btn').click();

    const saved = await page.evaluate(() => window.__saved);
    expect(saved.method).toBe('dialog');
    expect(saved.filename).toBe('Meu_Mapa_organomap.json');

    const parsed = JSON.parse(saved.text);
    expect(parsed).toHaveProperty('title');
    expect(Array.isArray(parsed.nodes)).toBe(true);
    expect(parsed.nodes.length).toBeGreaterThan(0);
    expect(parsed.nodes[0].showHeader).toBe(false);
  });

  test('updates view transform for zoom around mouse pointer, pan and reset actions', async ({ page }) => {
    await gotoApp(page);
    const canvasBox = await page.locator('#canvas-container').boundingBox();
    const pivotX = canvasBox.x + canvasBox.width * 0.32;
    const pivotY = canvasBox.y + canvasBox.height * 0.38;

    const beforeWheel = await getViewState(page);
    const worldBeforeX = (pivotX - beforeWheel.x) / beforeWheel.scale;
    const worldBeforeY = (pivotY - beforeWheel.y) / beforeWheel.scale;

    await page.mouse.move(pivotX, pivotY);
    await page.mouse.wheel(0, -120);

    const afterWheel = await getViewState(page);
    expect(afterWheel.scale).toBeGreaterThan(beforeWheel.scale);
    const worldAfterX = (pivotX - afterWheel.x) / afterWheel.scale;
    const worldAfterY = (pivotY - afterWheel.y) / afterWheel.scale;
    expect(Math.abs(worldAfterX - worldBeforeX)).toBeLessThan(0.5);
    expect(Math.abs(worldAfterY - worldBeforeY)).toBeLessThan(0.5);

    const startX = canvasBox.x + canvasBox.width * 0.7;
    const startY = canvasBox.y + canvasBox.height * 0.7;
    await page.mouse.move(startX, startY);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(startX + 80, startY + 60);
    await page.mouse.up({ button: 'right' });
    const afterPan = await getViewState(page);
    expect(afterPan.x).not.toBe(afterWheel.x);
    expect(afterPan.y).not.toBe(afterWheel.y);

    await page.locator('#reset-view-btn').click();
    const afterResetView = await getViewState(page);
    expect(afterResetView.scale).toBe(1);
    expect(afterResetView.x).not.toBe(afterPan.x);
    expect(afterResetView.y).not.toBe(afterPan.y);
  });
});
