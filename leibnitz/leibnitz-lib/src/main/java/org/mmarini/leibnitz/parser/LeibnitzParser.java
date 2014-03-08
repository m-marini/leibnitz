/**
 * 
 */
package org.mmarini.leibnitz.parser;

import java.io.File;
import java.io.IOException;

import javax.xml.XMLConstants;
import javax.xml.parsers.ParserConfigurationException;
import javax.xml.parsers.SAXParser;
import javax.xml.parsers.SAXParserFactory;
import javax.xml.validation.Schema;
import javax.xml.validation.SchemaFactory;

import org.mmarini.leibnitz.FunctionGenerator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.xml.sax.SAXException;

/**
 * @author US00852
 * 
 */
public class LeibnitzParser {
	private static Logger log = LoggerFactory.getLogger(LeibnitzParser.class);
	private static final String XSD_RESOURCE = "/leibnitz-1-0-0.xsd";

	private SAXParserFactory factory;

	/**
	 * 
	 */
	public LeibnitzParser() {
	}

	/**
	 * @throws SAXException
	 * 
	 */
	private void createFactory() throws SAXException {
		if (factory == null) {
			final Schema schema = SchemaFactory.newInstance(
					XMLConstants.W3C_XML_SCHEMA_NS_URI).newSchema(
					getClass().getResource(XSD_RESOURCE));
			factory = SAXParserFactory.newInstance();
			factory.setNamespaceAware(true);
			factory.setSchema(schema);
		}
	}

	/**
	 * 
	 * @param file
	 * @return
	 * @throws SAXException
	 * @throws ParserConfigurationException
	 * @throws IOException
	 */
	public FunctionGenerator parse(final String file)
			throws ParserConfigurationException, SAXException, IOException {
		log.debug("Parsing " + file + " ...");
		createFactory();
		final SAXParser parser = factory.newSAXParser();
		final LeibnitzSaxHandler handler = new LeibnitzSaxHandler();
		parser.parse(new File(file), handler);
		return handler.getGenerator();
	}
}