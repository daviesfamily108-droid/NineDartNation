import type { Homography, Point } from "./vision";
import { imageToBoard, scoreAtBoardPoint } from "./vision";

export function scoreFromImagePoint(H_boardToImage: Homography, pImg: Point) {
  const pBoard = imageToBoard(H_boardToImage, pImg);
  return scoreAtBoardPoint(pBoard);
}
