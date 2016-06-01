/* global process */
/*******************************************************************************
 * Copyright (c) 2015 IBM Corp.
 *
 * All rights reserved. 
 *
 * Contributors:
 *   David Huffman - Initial implementation
 *******************************************************************************/


var vcap_app = {application_uris: ['']};						//default blank

exports.SERVER = 	{
	HOST:'localhost',
	PORT: 3000,
	DESCRIPTION: 'Localhost',
	EXTURI: process.env.EXTURI || 'localhost:3000',
	vcap_app: vcap_app
 };

////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////     Common     ////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////
exports.DEBUG = vcap_app;
exports.USER1 = 'bob';									//left username
exports.USER2 = 'leroy';								//right username
