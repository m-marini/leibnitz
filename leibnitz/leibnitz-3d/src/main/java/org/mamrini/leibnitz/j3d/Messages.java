/**
 * 
 */
package org.mamrini.leibnitz.j3d;

import java.util.MissingResourceException;
import java.util.ResourceBundle;

/**
 * @author US00852
 *
 */
public class Messages {
	private static final String BUNDLE_NAME = "org.mamrini.leibnitz.j3d.messages"; //$NON-NLS-1$

	private static final ResourceBundle RESOURCE_BUNDLE = ResourceBundle
			.getBundle(BUNDLE_NAME);

	private Messages() {
	}

	public static String getString(String key) {
		try {
			return RESOURCE_BUNDLE.getString(key);
		} catch (MissingResourceException e) {
			return '!' + key + '!';
		}
	}
}
