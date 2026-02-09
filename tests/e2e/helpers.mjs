import { expect } from '@playwright/test';

export async function gotoApp(page) {
  await page.goto('/');
  await expect(page.locator('#nodes-layer .node')).toHaveCount(1);
}

export async function getModel(page) {
  return page.evaluate(() => ({
    projectTitle,
    nodes: nodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      parentId: n.parentId,
      title: n.title,
      text: n.text,
      showHeader: n.showHeader,
      style: { ...n.style }
    }))
  }));
}

export async function getViewState(page) {
  return page.evaluate(() => {
    const transform = document.getElementById('world').style.transform;
    const parsed = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec(transform);
    return {
      x: parsed ? Number(parsed[1]) : null,
      y: parsed ? Number(parsed[2]) : null,
      scale: parsed ? Number(parsed[3]) : null,
      transform
    };
  });
}

export async function clickAddChild(page, nodeId) {
  await page.locator(`#${nodeId} .add-child-btn`).click();
}

export async function dragNode(page, nodeId, dx, dy) {
  const box = await page.locator(`#${nodeId}`).boundingBox();
  if (!box) throw new Error(`Node ${nodeId} has no bounding box`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
  await page.mouse.up({ button: 'left' });
}

export async function dragSubtreeWithShift(page, nodeId, dx, dy) {
  const box = await page.locator(`#${nodeId}`).boundingBox();
  if (!box) throw new Error(`Node ${nodeId} has no bounding box`);
  await page.locator(`#${nodeId}`).dispatchEvent('mousedown', {
    button: 0,
    shiftKey: true,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2
  });
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
  await page.mouse.up({ button: 'left' });
}

export async function resizeNodeBottomRight(page, nodeId, dx, dy) {
  const resizer = page.locator(`#${nodeId} .resizer-rb`);
  const box = await resizer.boundingBox();
  if (!box) throw new Error(`Node ${nodeId} resizer has no bounding box`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
  await page.mouse.up({ button: 'left' });
}

export async function importDiagram(page, payload, filename = 'import.json') {
  await page.locator('#import-file-input').setInputFiles({
    name: filename,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload))
  });
}

export function byId(items) {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}
