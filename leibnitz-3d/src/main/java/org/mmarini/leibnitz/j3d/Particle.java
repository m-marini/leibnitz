/**
 * 
 */
package org.mmarini.leibnitz.j3d;

import javax.media.j3d.Appearance;
import javax.media.j3d.Material;
import javax.media.j3d.TransformGroup;
import javax.vecmath.Color3f;

import com.sun.j3d.utils.geometry.Sphere;

/**
 * @author US00852
 * 
 */
public class Particle extends AbstractCorpe implements Corpe {

	private static final float SHININESS = 80f;
	private static final float RADIUS = 0.03f;

	private final Material material;

	/**
	 * 
	 */
	public Particle() {
		material = new Material();

		final Color3f objColor = new Color3f(0.0f, 0.0f, 1f);
		final Color3f black = new Color3f();
		final Color3f white = new Color3f(1f, 1f, 1f);

		material.setAmbientColor(objColor);
		material.setEmissiveColor(black);
		material.setDiffuseColor(objColor);
		material.setSpecularColor(white);
		material.setShininess(SHININESS);

		final Appearance appearance = new Appearance();
		appearance.setMaterial(material);

		final Sphere shape = new Sphere(RADIUS);
		shape.setAppearance(appearance);

		final TransformGroup locationGroup = getLocationGroup();
		locationGroup.addChild(shape);
		addChild(locationGroup);
	}

	/**
	 * 
	 * @param color
	 */
	public void setColor(final Color3f color) {
		material.setAmbientColor(color);
		material.setDiffuseColor(color);
	}
}