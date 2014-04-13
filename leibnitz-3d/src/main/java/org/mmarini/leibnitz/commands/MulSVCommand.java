/**
 * 
 */
package org.mmarini.leibnitz.commands;

import org.mmarini.leibnitz.Vector;

/**
 * @author US00852
 * 
 */
public class MulSVCommand extends AbstractBinaryCommand {

	/**
	 * 
	 * @param function
	 * @param function2
	 */
	public MulSVCommand(final Command function, final Command function2) {
		super(function, function2);
	}

	/**
	 * @see org.mmarini.leibnitz.commands.Command#apply(org.mmarini.leibnitz.commands
	 *      .CommandContext)
	 */
	@Override
	public void apply(final CommandContext context) {
		getCommand1().apply(context);
		final double a = context.getScalar();
		getCommand2().apply(context);
		final Vector b = context.getVector();
		b.scale(a);
		context.setVector(b);
	}

	/**
	 * 
	 * @return
	 */
	@Override
	public TypeDimensions getDimensions() {
		return getCommand2().getDimensions();
	}

	/**
	 * @see org.mmarini.leibnitz.commands.Command#getType()
	 */
	@Override
	public Type getType() {
		return Type.VECTOR;
	}

	/**
	 * @see java.lang.Object#toString()
	 */
	@Override
	public String toString() {
		return new StringBuilder("(").append(getCommand1()).append("*")
				.append(getCommand2()).append(")").toString();
	}
}