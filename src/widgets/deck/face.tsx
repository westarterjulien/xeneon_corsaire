import { Icon } from "../../sdk/icons";
import { AppIcon } from "../apps/AppIcon";
import type { ButtonFace } from "./model";

/** Visuel d'un bouton : image perso / logo, icône de logiciel, icône de la bibliothèque ou initiale. */
export function FaceVisual({ face, size }: { face: ButtonFace; size: string }) {
  if (face.image?.src) {
    return face.image.mono ? (
      <span className="dk-mask" style={{ width: size, height: size, WebkitMaskImage: `url("${face.image.src}")`, maskImage: `url("${face.image.src}")` }} />
    ) : (
      <img className="dk-img" src={face.image.src} alt="" style={{ width: size, height: size }} draggable={false} />
    );
  }
  if (face.app) return <AppIcon app={face.app} size={size} />;
  if (face.icon) return <Icon name={face.icon} />;
  return <span className="dk-letter">{face.label.charAt(0)}</span>;
}

