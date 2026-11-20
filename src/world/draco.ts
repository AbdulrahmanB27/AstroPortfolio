import { useGLTF } from '@react-three/drei'

/** Models are Draco-compressed; the decoder is served from this site, never a CDN. Import before any useGLTF call. */
export const DRACO_PATH = `${import.meta.env.BASE_URL}draco/`
useGLTF.setDecoderPath(DRACO_PATH)
