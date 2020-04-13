# -*- coding: utf-8 -*-

{
    'name': 'Ukrainian Fiscal Recorders',
    'version': '1.1',
    'category': 'Point of Sale',
    'sequence': 6,
    'summary': 'Module to manage fiscal recorders in Point of Sale',
    'description': """

========================================

""",
    'depends': ['point_of_sale', 'pos_iot'],
    'author': '',
    'website': '',
    'test': [
    ],
    'data': [
        'views/ukr_fiscal_view.xml',
        'views/pos_config_view.xml',
        'views/iot_views.xml',
        'static/src/xml/templates.xml',
        'security/ir.model.access.csv'
    ],

    'installable': True,
    'application': True
}
