import {
  computeCameraCenter,
  type CameraState,
} from '../coordinates.ts';

export class Camera {
  state: CameraState = {
    x: 0,
    y: 0,
    stageOffsetX: 0,
    stageOffsetY: 0,
  };

  centerOnGrid(gridW: number, gridH: number, viewW: number, viewH: number): void {
    this.state = computeCameraCenter(gridW, gridH, viewW, viewH);
  }
}
