declare module 'js-aruco' {
  export namespace AR {
    interface Corner {
      x: number
      y: number
    }

    interface Marker {
      id: number
      corners: Corner[]
      // Optional properties present in library runtime
      confidence?: number
    }

    class Detector {
      constructor()
      detect(imageData: ImageData): Marker[]
    }

    class Marker {
      id: number
      constructor()
      draw(ctx: CanvasRenderingContext2D, size: number): void
      // Non-standard helper available in js-aruco build
      generateImageData(size: number): ImageData
    }

    class MarkerDictionary {
      constructor()
      // Utility to get marker data by id
      getMarker(id: number): Marker
    }
  }
}
