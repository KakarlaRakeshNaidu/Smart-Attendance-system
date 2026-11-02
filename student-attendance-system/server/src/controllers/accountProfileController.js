const A = require('../services/academicService'),
    D = require('../services/administrationService');
exports.profile = D.wrap(async (req, res) => {
    const account = req.account;
    if (req.method === 'PUT') {
        if (req.body.name !== undefined) account.name = A.text(req.body.name, 'Name');
        if (req.body.email !== undefined && req.body.email.trim().toLowerCase() !== account.email)
            A.fail(409, 'Contact the administrator to change the login email.');
        for (const key of ['subject', 'description'])
            if (req.body[key] !== undefined) {
                if (typeof req.body[key] !== 'string' || req.body[key].length > 2000)
                    A.fail(400, 'Use profile text of at most 2000 characters.');
                account[key] = req.body[key].trim();
            }
        await account.save();
        await D.audit(req, 'UPDATE_PROFILE', 'Account', account.id, { name: account.name });
    }
    if (req.file) {
        account.profilePhoto = '/uploads/' + req.file.path.replace(/\\/g, '/').split('/uploads/').pop();
        await account.save();
    }
    const user = {
        id: account.id,
        _id: account._id,
        name: account.name,
        email: account.email,
        role: account.role,
        subject: account.subject || '',
        description: account.description || '',
        profilePhoto: account.profilePhoto || '',
        createdAt: account.createdAt
    };
    res.json({ success: true, user, teacher: user, message: 'Profile saved' });
});
