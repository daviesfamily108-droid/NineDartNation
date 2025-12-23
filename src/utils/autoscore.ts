import type { Homography, Point } from "./vision";
import {
  imageToBoard,
  scoreAtBoardPoint,
  scoreAtBoardPointTheta,
} from "./vision";

// Optional theta (radians) applies orientation compensation so sector mapping matches TV order.
export function scoreFromImagePoint(
  H_boardToImage: Homography,
  pImg: Point,
  theta?: number,
  sectorOffset?: number,
) {
  const pBoard = imageToBoard(H_boardToImage, pImg);
  if (!pBoard) {
    // If homography inversion failed, return a MISS
    return { base: 0, ring: "MISS" as const, sector: null, mult: 0 as const };
  }
  if (typeof theta === "number") {
    return scoreAtBoardPointTheta(pBoard, theta, sectorOffset ?? 0);
  }
  return scoreAtBoardPoint(pBoard);
}
