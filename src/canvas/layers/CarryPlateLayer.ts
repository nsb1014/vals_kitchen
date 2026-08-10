import { Container, Sprite } from 'pixi.js';
import { getFoodTexture, getFurnitureTexture } from '../../assets/loader.ts';
import { foodIconSpriteName } from '../../assets/ingredient-icons.ts';
import {
  carryPlateSpriteLayout,
  facingNameFromIndex,
} from '../carry-plate-layout.ts';

/**
 * Atlas plate + food icon overlay for the Graphics ellipse fallback path.
 * Hidden when ActorLayer already binds an authored carry pose.
 */
export class CarryPlateLayer {
  readonly view = new Container();
  private readonly plate = new Sprite();
  private readonly food = new Sprite();

  constructor() {
    this.view.sortableChildren = true;
    this.view.eventMode = 'none';
    this.plate.roundPixels = true;
    this.food.roundPixels = true;
    this.plate.anchor.set(0.5, 0.5);
    this.food.anchor.set(0.5, 0.5);
    this.plate.visible = false;
    this.food.visible = false;
    this.view.addChild(this.plate);
    this.view.addChild(this.food);
  }

  sync(opts: {
    show: boolean;
    feet: { x: number; y: number };
    facing: 0 | 1 | 2 | 3;
    ingredientId?: string | null;
  }): void {
    if (!opts.show) {
      this.plate.visible = false;
      this.food.visible = false;
      return;
    }

    const layout = carryPlateSpriteLayout(
      opts.feet,
      facingNameFromIndex(opts.facing),
    );
    if (!layout.visible) {
      this.plate.visible = false;
      this.food.visible = false;
      return;
    }

    const plateTex = getFurnitureTexture('carry_plate');
    if (plateTex) {
      this.plate.texture = plateTex;
      this.plate.visible = true;
      this.plate.position.set(
        Math.round(layout.plate.x),
        Math.round(layout.plate.y),
      );
      this.plate.zIndex = layout.plate.sortY;
      this.plate.scale.set(1);
    } else {
      this.plate.visible = false;
    }

    const ingredientId = opts.ingredientId ?? null;
    const foodTex =
      ingredientId != null
        ? getFoodTexture(foodIconSpriteName(ingredientId))
        : null;
    if (foodTex) {
      this.food.texture = foodTex;
      this.food.visible = true;
      this.food.position.set(
        Math.round(layout.food.x),
        Math.round(layout.food.y),
      );
      this.food.zIndex = layout.plate.sortY + 0.1;
      this.food.scale.set(0.45);
    } else {
      this.food.visible = false;
    }

    this.view.zIndex = layout.plate.sortY;
  }
}
