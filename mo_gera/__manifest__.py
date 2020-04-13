# -*- coding: utf-8 -*-

{
    'name': 'GERA MG N707TS',
    'version': '1.0',
    'category': 'Point of Sale',
    'sequence': 6,
    'summary': 'Module which adds model of fiscal recorder GERA MG N707TS to ukrainian fiscal recorders module',
    'description': """

========================================

""",
    'depends': ['point_of_sale','mo_ukr_fiscal_recorder'],
    'author': '',
    'website': '',
    'test': [
    ],
    'data': [
        'views/fiscal_recorder_gera_view.xml',
        'views/res_users_views.xml',
        'static/src/xml/templates.xml',
        'security/ir.model.access.csv'
    ],
    'qweb': ['static/src/xml/pos.xml'],
    'installable': True,
    'application': True
}
